const GRID_SIZE = 32;

const canvas = document.querySelector("canvas")!;

if (!navigator.gpu) {
  const message = "You browser doesn't support WebGPU";
  document.body.prepend(
    Object.assign(document.createElement("h1"), { innerText: message })
  );
  throw new Error(message);
}

const adapter = await navigator.gpu.requestAdapter();

if (!adapter) {
  throw new Error("No appropriate GPUAdapter found.");
}

const device = await adapter.requestDevice();

const context = canvas.getContext("webgpu");

if (!context) {
  throw new Error("Cannot get GPUCanvasContext.");
}
const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

context.configure({
  device,
  format: canvasFormat,
});

const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);

const cellStateStorage = [
  device.createBuffer({
    label: "Cell State A",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  }),
  device.createBuffer({
    label: "Cell State B",
    size: cellStateArray.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  }),
];

for (let i = 0; i < cellStateArray.length; ++i) {
  cellStateArray[i] = Math.random() > 0.6 ? 1 : 0;
}

device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);

device.queue.writeBuffer(cellStateStorage[1], 0, cellStateArray);

const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);

const uniformBuffer = device.createBuffer({
  label: "Grid Uniforms",
  size: uniformArray.byteLength,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

// prettier-ignore
const vertices = new Float32Array([
  -0.8, -0.8,
  0.8, -0.8,
  0.8, 0.8,

  -0.8, -0.8,
  0.8, 0.8,
  -0.8, 0.8
]);

const vertexBuffer = device.createBuffer({
  label: "Cell vertices",
  size: vertices.byteLength,
  usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
});

device.queue.writeBuffer(vertexBuffer, 0, vertices);

const vertexBufferLayout: GPUVertexBufferLayout = {
  arrayStride: 8,
  attributes: [
    {
      format: "float32x2",
      offset: 0,
      shaderLocation: 0,
    },
  ],
};

const cellShaderModule = device.createShaderModule({
  label: "Cell Shader",
  code: `
    @group(0) @binding(0) var<uniform> grid: vec2f;
    @group(0) @binding(1) var<storage> cellState: array<u32>;

    struct VertexInput {
      @location(0) pos: vec2f,
      @builtin(instance_index) instance: u32
    }

    struct VertexOutput {
      @builtin(position) pos: vec4f,
      @location(0) cell: vec2f
    }

    @vertex
    fn vertexMain(input: VertexInput) -> VertexOutput {
      let i = f32(input.instance);
      let cell = vec2f(i % grid.x, floor(i / grid.y));
      let state = f32(cellState[input.instance]);
      let cellOffset = cell / grid * 2;
      let gridPos = (input.pos * state + 1) / grid - 1 + cellOffset;

      var output: VertexOutput;

      output.pos = vec4f(gridPos, 0, 1);
      output.cell = cell;

      return output;
    }

    struct FragInput {
      @location(0) cell: vec2f
    }

    @fragment
    fn fragmentMain(input: FragInput) -> @location(0) vec4f {
      let c = input.cell / grid;
      return vec4f(c, 1 - c.x, 1);
    }
  `,
});

const WORKGROUP_SIZE = 8;

const simulationShaderModule = device.createShaderModule({
  label: "Game Of Life Simulation Shader",
  code: `
    @group(0) @binding(0) var<uniform> grid: vec2f;

    @group(0) @binding(1) var<storage> cellStateIn: array<u32>;
    @group(0) @binding(2) var<storage, read_write> cellStateOut: array<u32>;

    fn cellIndex(cell: vec2u) -> u32 {
      return (cell.y % u32(grid.y)) * u32(grid.x) + (cell.x % u32(grid.x));
    }

    fn cellActive(x: u32, y: u32) -> u32 {
      return cellStateIn[cellIndex(vec2(x, y))];
    }

    @compute
    @workgroup_size(${WORKGROUP_SIZE}, ${WORKGROUP_SIZE})
    fn computeMain(@builtin(global_invocation_id) cell: vec3u) {
      let i = cellIndex(cell.xy);
      let activeNeighbors = cellActive(cell.x+1, cell.y+1) +
                            cellActive(cell.x+1, cell.y) +
                            cellActive(cell.x+1, cell.y-1) +
                            cellActive(cell.x, cell.y-1) +
                            cellActive(cell.x-1, cell.y-1) +
                            cellActive(cell.x-1, cell.y) +
                            cellActive(cell.x-1, cell.y+1) +
                            cellActive(cell.x, cell.y+1);

      switch activeNeighbors {
        case 2: { // Active cells with 2 neighbors stay active.
          cellStateOut[i] = cellStateIn[i];
        }
        case 3: { // Cells with 3 neighbors become or stay active.
          cellStateOut[i] = 1;
        }
        default: { // Cells with < 2 or > 3 neighbors become inactive.
          cellStateOut[i] = 0;
        }
      }
    }
  `,
});

const cellBindGroupLayout = device.createBindGroupLayout({
  label: "Cell Bind Group Layout",
  entries: [
    {
      binding: 0,
      visibility:
        GPUShaderStage.VERTEX |
        GPUShaderStage.COMPUTE |
        GPUShaderStage.FRAGMENT,
      buffer: {},
    },
    {
      binding: 1,
      visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE,
      buffer: { type: "read-only-storage" },
    },
    {
      binding: 2,
      visibility: GPUShaderStage.COMPUTE,
      buffer: { type: "storage" },
    },
  ],
});

const pipelineLayout = device.createPipelineLayout({
  label: "Cell Pipeline Layout",
  bindGroupLayouts: [cellBindGroupLayout],
});

const cellPipeline = device.createRenderPipeline({
  label: "Cell Pipeline",
  layout: pipelineLayout,
  vertex: {
    module: cellShaderModule,
    entryPoint: "vertexMain",
    buffers: [vertexBufferLayout],
  },
  fragment: {
    module: cellShaderModule,
    entryPoint: "fragmentMain",
    targets: [
      {
        format: canvasFormat,
      },
    ],
  },
});

const simulationPipeline = device.createComputePipeline({
  label: "Game of Life Pipeline",
  layout: pipelineLayout,
  compute: {
    module: simulationShaderModule,
    entryPoint: "computeMain",
  },
});

const bindGroups = [
  device.createBindGroup({
    label: "Cell Renderer Bind Group A",
    layout: cellBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
      {
        binding: 1,
        resource: { buffer: cellStateStorage[0] },
      },
      {
        binding: 2,
        resource: { buffer: cellStateStorage[1] },
      },
    ],
  }),
  device.createBindGroup({
    label: "Cell Renderer Bind Group B",
    layout: cellBindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
      {
        binding: 1,
        resource: { buffer: cellStateStorage[1] },
      },
      {
        binding: 2,
        resource: { buffer: cellStateStorage[0] },
      },
    ],
  }),
];

const UPDATE_INTERVAL = 200;
let step = 0;

function updateGrid() {
  const encoder = device.createCommandEncoder();

  const computePass = encoder.beginComputePass();

  computePass.setPipeline(simulationPipeline);
  computePass.setBindGroup(0, bindGroups[step % 2]);

  const workgroupCount = Math.ceil(GRID_SIZE / WORKGROUP_SIZE);
  computePass.dispatchWorkgroups(workgroupCount, workgroupCount);

  computePass.end();

  step++;

  const pass = encoder.beginRenderPass({
    colorAttachments: [
      {
        view: context!.getCurrentTexture().createView(),
        loadOp: "clear",
        storeOp: "store",
      },
    ],
  });

  pass.setPipeline(cellPipeline);
  pass.setVertexBuffer(0, vertexBuffer);
  pass.setBindGroup(0, bindGroups[step % 2]);
  pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE);

  pass.end();

  const commandBuffer = encoder.finish();

  device.queue.submit([commandBuffer]);
}

setInterval(updateGrid, UPDATE_INTERVAL);

export {};
