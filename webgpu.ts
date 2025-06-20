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

const encoder = device.createCommandEncoder();

const pass = encoder.beginRenderPass({
  colorAttachments: [
    {
      view: context.getCurrentTexture().createView(),
      loadOp: "clear",
      clearValue: {
        r: 1,
        g: 0,
        b: 0,
        a: 1,
      },
      storeOp: "store",
    },
  ],
});

pass.end();

const commandBuffer = encoder.finish();

device.queue.submit([commandBuffer]);

export {};
