import {matchesPriceRange} from './price-filter.js';
const collator = new Intl.Collator('pt-BR',{sensitivity:'base',numeric:true});
export function filterCatalog(products,{category='',store='',min=null,max=null,status='all',today}) {
  const filterOffers=!!store || min!==null || max!==null || status!=='all';
  return products.filter(product => {
    if (category && product.category!==category) return false;
    if (!filterOffers) return true;
    return product.offers.some(offer => {
      const active=!offer.valid_until || offer.valid_until>=today;
      return (!store || offer.store===store) && (min===null && max===null || matchesPriceRange(offer,min,max)) && (status==='all' || (status==='active' ? active : !active));
    });
  });
}
export function sortCatalog(products,column,direction) {
  const value=product=>column==='price' ? Math.min(...product.offers.flatMap(offer=>[offer.price,offer.club_price].filter(price=>Number.isSafeInteger(price) && price>0))) : product[column];
  return [...products].sort((a,b)=>{
    const x=value(a),y=value(b),missingX=x==null || x==='' || x===Infinity,missingY=y==null || y==='' || y===Infinity;
    if (missingX || missingY) return missingX===missingY ? 0 : missingX ? 1 : -1;
    return (column==='price' ? x-y : collator.compare(String(x),String(y))) * (direction==='desc' ? -1 : 1);
  });
}
