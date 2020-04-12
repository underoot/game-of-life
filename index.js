class Game {
  width = 30;
  height = 30;

  period = 500;
  clickPeriod = 3000;

  cells = new Array(this.height)
    .fill()
    .map(() => new Array(this.width).fill(0))

  cellsCount = 0;

  prevTickTime = null;
  prevClickTime = null;

  constructor(element) {
    this.el = element;
    this.ctx = element.getContext('2d');
    this.onClick = this.onClick.bind(this);
  }

  init() {
    this.sizeX = (this.el.width - 1) / this.width;
    this.sizeY = (this.el.height - 1) / this.height;

    this.ctx.lineCap = 'square';
    this.ctx.strokeStyle = '#ccc';

    for (let i = 0; i < this.height; i++) {
      for (let k = 0; k < this.width; k++) {
        this.ctx.strokeRect(
          k * this.sizeX + 1,
          i * this.sizeY + 1,
          this.sizeX - 1,
          this.sizeY - 1
        );
      }
    }

    this.initEventHandlers();
    this.tick();
  }

  fillCell(x, y) {
    this.ctx.fillStyle = '#000';
    this.ctx.fillRect(
      x * this.sizeX + 1.5,
      y * this.sizeY + 1.5,
      this.sizeX - 2,
      this.sizeY - 2
    );
  }

  clearRect(x, y) {
    this.ctx.clearRect(
      x * this.sizeX + 1,
      y * this.sizeY + 1,
      this.sizeX - 1,
      this.sizeY - 1
    );

    this.ctx.strokeRect(
      x * this.sizeX + 1,
      y * this.sizeY + 1,
      this.sizeX - 1,
      this.sizeY - 1
    );
  }

  birth(x, y) {
    if (x < 0 || y < 0) {
      return;
    }

    this.fillCell(x, y);
    this.cellsCount++;
    this.cells[y][x] = 1;
  }

  tick() {
    requestAnimationFrame(time => {
      if (this.prevClickTime && time - this.prevClickTime < this.clickPeriod) {
        this.tick();
        return;
      }

      if (this.prevClickTime) {
        this.prevClickTime = null;
      }

      if (!this.prevTickTime || time - this.prevTickTime < this.period) {
        if (!this.prevTickTime) {
          this.prevTickTime = time;
        }

        this.tick();
        return;
      }

      this.prevTickTime = time;

      for (let i = 0; i < this.height; i++) {
        for (let k = 0; k < this.width; k++) {
          const count = this.getAroundCount(k, i);

          if (count === 3 && this.cells[i][k] === 0) {
            this.cells[i][k] = 3;
          } else if ((count < 2 || count > 3) && this.cells[i][k] === 1) {
            this.cells[i][k] = 2;
          }
        }
      }

      for (let i = 0; i < this.height; i++) {
        for (let k = 0; k < this.width; k++) {
          if (this.cells[i][k] === 3) {
            this.birth(k, i);
          } else if (this.cells[i][k] === 2) {
            this.death(k, i);
          }
        }
      }

      this.tick();
    });
  }

  getAroundCount(x, y) {
    let count = 0;

    for (let i = y - 1; i <= y + 1; i++) {
      for (let k = x - 1; k <= x + 1; k++) {
        if (
          (i === y && k === x) 
          || i < 0
          || k < 0
          || i >= this.height
          || k >= this.width
        ) {
          continue;
        }

        if ([1, 2].includes(this.cells[i][k])) {
          count++;
        }
      }
    }

    return count;
  }

  death(x, y) {
    if (x < 0 || y < 0) {
      return;
    }

    this.clearRect(x, y);
    this.cellsCount--;
    this.cells[y][x] = 0;
  }

  onClick(e) {
    const [x, y] = [
      Math.floor(e.offsetX / this.sizeX),
      Math.floor(e.offsetY / this.sizeY)
    ];

    this.prevClickTime = performance.now();

    if (this.cells[y][x] === 1) {
      this.death(x, y);
    } else {
      this.birth(x, y);
    }
  }

  initEventHandlers() {
    this.el.addEventListener('click', this.onClick);
  }
}

new Game(document.querySelector('#game')).init();