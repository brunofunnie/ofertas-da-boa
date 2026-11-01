const validDate=value=>typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
const cents=value=>typeof value==='number' && Number.isFinite(value) && value>0 && value<=100000 ? Math.round(value*100) : null;
import {warning} from './status.js';
export const expiredFlyers=()=>warning('Folhetos vencidos; aguardando ofertas novas.');
export const expiredFlyer=(data,today)=>validDate(data?.valid_until) && data.valid_until<today;
export function parseFlyer(data, imageUrl, today) {
  if (!validDate(data?.valid_from) || !validDate(data?.valid_until) || data.valid_from>today || data.valid_until<today || data.valid_from>data.valid_until || !Array.isArray(data.products)) return [];
  return data.products.flatMap(product=>{
    const price=cents(product?.price), club=cents(product?.club_price), productName=typeof product?.name==='string' ? product.name.trim() : '';
    if (!productName || productName.length>200 || !price || (club && club>=price)) return [];
    return [{name:productName,price,club_price:club,price_unit:product.price_unit==='kg' ? 'kg' : 'un',valid_until:data.valid_until,extracted:true,url:imageUrl}];
  });
}
