import {lookup} from 'node:dns';
import {BlockList, isIP} from 'node:net';
import {Agent} from 'undici';

const blocked = new BlockList();
for (const [address,prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) blocked.addSubnet(address,prefix,'ipv4');
for (const [address,prefix] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8],['2001:db8::',32]]) blocked.addSubnet(address,prefix,'ipv6');
const globalIPv6 = new BlockList(); globalIPv6.addSubnet('2000::',3,'ipv6');
export function isPublicAddress(address) {
  const family=isIP(address);
  if (!family || blocked.check(address, family === 4 ? 'ipv4' : 'ipv6')) return false;
  return family === 4 || globalIPv6.check(address,'ipv6');
}
export function createSafeLookup(resolver = lookup) {
  return (hostname, options, callback) => {
    resolver(hostname, {...options,all:true}, (error, addresses) => {
      if (error) return callback(error);
      if (!addresses.length || addresses.some(item => !isPublicAddress(item.address))) return callback(Error('Destino de rede não permitido.'));
      if (options.all) return callback(null, addresses);
      return callback(null, addresses[0].address, addresses[0].family);
    });
  };
}
export const outboundAgent = new Agent({connect:{lookup:createSafeLookup()}});
