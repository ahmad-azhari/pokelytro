export class Item {
  _id?: string;
  name!: string;
  gen!: string;
  release!: string;
  cost!: number;

  constructor(init?: Partial<Item>) {
    if (init) Object.assign(this, init);
  }
}
