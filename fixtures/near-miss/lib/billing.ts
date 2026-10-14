// Safe: period taken from the item whose price grants access (multi-item safe).
export function periodEnd(sub: { items: { data: { price: { id: string }; current_period_end: number }[] } }, granting: string[]) {
  const item = sub.items.data.length === 1 ? sub.items.data[0] : sub.items.data.find((i) => granting.includes(i.price.id));
  return item ? item.current_period_end : null;
}
