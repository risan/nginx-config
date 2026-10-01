// A local ACME server for the smoke tests: Pebble plus its test DNS server, on a private network with fixed addresses.
// Pebble resolves every test name to the edge address through the DNS server, so a name needs no real DNS.
const PEBBLE_IMAGE = process.env.PEBBLE_IMAGE ?? 'ghcr.io/letsencrypt/pebble:latest';
const CHALLENGE_IMAGE = process.env.PEBBLE_CHALLTESTSRV_IMAGE ?? 'ghcr.io/letsencrypt/pebble-challtestsrv:latest';

// The network gets a fixed subnet because the DNS server needs the edge address up front.
// A random 10.x range avoids clashing with other networks.
function createNetworkWithFixedSubnet(smoke) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const subnet = process.env.SMOKE_ACME_SUBNET ?? `10.${200 + Math.floor(Math.random() * 50)}.${Math.floor(Math.random() * 250)}.0/24`;
    try {
      smoke.createNetwork(['--subnet', subnet]);

      return subnet.replace(/\.0\/24$/, '');
    } catch (error) {
      if (process.env.SMOKE_ACME_SUBNET) {
        throw error;
      }
    }
  }

  throw new Error('could not find a free subnet for the ACME smoke network');
}

export function startPebble(smoke) {
  const prefix = createNetworkWithFixedSubnet(smoke);
  const edgeIp = `${prefix}.10`;
  const dnsIp = `${prefix}.11`;
  smoke.startContainer('dns', ['--ip', dnsIp, CHALLENGE_IMAGE, '-defaultIPv6', '', '-defaultIPv4', edgeIp]);
  const pebble = smoke.startContainer('pebble', [
    '--ip', `${prefix}.12`, '--network-alias', 'pebble',
    '-e', 'PEBBLE_VA_NOSLEEP=1', '-e', 'PEBBLE_VA_ALWAYS_VALID=0',
    PEBBLE_IMAGE, '-config', 'test/config/pebble-config.json', '-dnsserver', `${dnsIp}:8053`
  ]);

  return { edgeIp, pebble };
}
