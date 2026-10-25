/** Default monitor templates per CI class: metric -> [warn, crit, direction]. 'low' means alert when value falls BELOW. */
export type Tpl = { metric: string; protocol: string; warn: number | null; crit: number | null; dir?: 'high' | 'low'; sustain?: number };
export const TEMPLATES: Record<string, Tpl[]> = {
  Server: [
    { metric: 'availability', protocol: 'ICMP', warn: null, crit: 1, dir: 'low', sustain: 3 },
    { metric: 'cpu', protocol: 'WMI', warn: 80, crit: 95 }, { metric: 'mem', protocol: 'WMI', warn: 85, crit: 95 },
    { metric: 'disk', protocol: 'WMI', warn: 80, crit: 92 }, { metric: 'service', protocol: 'WMI', warn: null, crit: 1, dir: 'low', sustain: 2 },
  ],
  VM: [
    { metric: 'availability', protocol: 'ICMP', warn: null, crit: 1, dir: 'low', sustain: 3 },
    { metric: 'cpu', protocol: 'AGENT', warn: 80, crit: 95 }, { metric: 'mem', protocol: 'AGENT', warn: 85, crit: 95 },
  ],
  Switch: [
    { metric: 'availability', protocol: 'ICMP', warn: null, crit: 1, dir: 'low', sustain: 3 },
    { metric: 'cpu', protocol: 'SNMP', warn: 80, crit: 95 }, { metric: 'mem', protocol: 'SNMP', warn: 85, crit: 95 },
    { metric: 'bandwidth', protocol: 'SNMP', warn: 75, crit: 90 },
  ],
  Router: [
    { metric: 'availability', protocol: 'ICMP', warn: null, crit: 1, dir: 'low', sustain: 3 },
    { metric: 'cpu', protocol: 'SNMP', warn: 80, crit: 95 }, { metric: 'bandwidth', protocol: 'SNMP', warn: 75, crit: 90 },
  ],
  Firewall: [
    { metric: 'availability', protocol: 'ICMP', warn: null, crit: 1, dir: 'low', sustain: 3 },
    { metric: 'cpu', protocol: 'SNMP', warn: 80, crit: 95 },
  ],
  IoT: [
    { metric: 'temperature', protocol: 'MQTT', warn: 30, crit: 35 }, { metric: 'battery', protocol: 'MQTT', warn: 25, crit: 10, dir: 'low' },
  ],
  UPS: [
    { metric: 'availability', protocol: 'SNMP', warn: null, crit: 1, dir: 'low', sustain: 3 },
    { metric: 'battery', protocol: 'SNMP', warn: 50, crit: 20, dir: 'low' }, { metric: 'temperature', protocol: 'SNMP', warn: 32, crit: 38 },
  ],
  Endpoint: [{ metric: 'availability', protocol: 'AGENT', warn: null, crit: 1, dir: 'low', sustain: 3 }, { metric: 'disk', protocol: 'AGENT', warn: 85, crit: 95 }],
};
export function dirFor(metric: string): 'high' | 'low' {
  return ['availability', 'service', 'battery'].includes(metric) ? 'low' : 'high';
}
export function severityFor(value: number, warn: number | null, crit: number | null, dir: 'high' | 'low'): 'critical' | 'warning' | null {
  if (dir === 'high') { if (crit != null && value >= crit) return 'critical'; if (warn != null && value >= warn) return 'warning'; }
  else { if (crit != null && value < crit) return 'critical'; if (warn != null && value < warn) return 'warning'; }
  return null;
}
