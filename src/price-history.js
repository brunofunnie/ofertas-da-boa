export function priceTrend(history = []) {
  if (history.length < 2) return 0;
  return Math.sign(history.at(-1).price - history.at(-2).price);
}
export function chartPoints(history) {
  if (!history.length) return [];
  const values=history.map(item=>item.price), min=Math.min(...values), max=Math.max(...values);
  const times=history.map(item=>Date.parse(`${(item.observed_at || '').replace(' ','T')}Z`));
  const timed=times.every(Number.isFinite) && times.at(-1)>times[0];
  return history.map((item,i)=>({x:history.length === 1 ? 160 : 18+284*(timed ? (times[i]-times[0])/(times.at(-1)-times[0]) : i/(history.length-1)),y:max===min ? 70 : 120-(item.price-min)*100/(max-min)}));
}
