import { Component, OnInit, inject } from '@angular/core';
import { ItemService } from '../../services/item/item';
import { Item } from '../../services/item/item';

@Component({
  selector: 'app-item',
  imports: [],
  templateUrl: './item.html',
  styleUrl: './item.css',
})
export class Items implements OnInit {
  private itemService = inject(ItemService);
  items: Item[] = [];
  loading = true;
  error: string | null = null;

  ngOnInit() {
    this.itemService.get().subscribe({
      next: (data: Item[]) => {
        this.items = data;
        this.loading = false;
      },
      error: (err) => {
        this.error = 'Error loading items';
        this.loading = false;
      },
    });
  }
}
