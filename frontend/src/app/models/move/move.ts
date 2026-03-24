export class Item {
  _id?: string;
  name!: string;
  power!: number;
  type!: string;
  damage_class!: string;
  accuracy!: number;
  pp!: number;
  description!: string;
  learned_by_ids!: number[];

  constructor(init?: Partial<Item>) {
    if (init) Object.assign(this, init);
  }
}
