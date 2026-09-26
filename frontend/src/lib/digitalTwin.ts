import type { WeatherScenarioRequest } from '@/services/api';
import type { NodeStatus } from '@/types';
import { CloudFog, CloudRainWind, Sun, Tornado } from 'lucide-react';

export interface ScenarioPreset {
  id: string;
  label: string;
  hint: string;
  icon: typeof Sun;
  scenario: WeatherScenarioRequest;
}

export const SCENARIO_PRESETS: ScenarioPreset[] = [
  { id: 'monsoon', label: 'Monsoon Deluge', hint: '55 mm/h · 65 km/h', icon: CloudRainWind, scenario: { scenarioName: 'Monsoon Deluge', rainfallMmPerHour: 55, windSpeedKmh: 65, visibilityMeters: 300, temperatureCelsius: 28, stormDurationHours: 4 } },
  { id: 'fog', label: 'Dense Fog Ground Stop', hint: '150 m · 7 h', icon: CloudFog, scenario: { scenarioName: 'Dense Fog Ground Stop', rainfallMmPerHour: 0, windSpeedKmh: 6, visibilityMeters: 150, temperatureCelsius: 11, stormDurationHours: 7 } },
  { id: 'cyclone', label: 'Cyclonic Storm', hint: '85 mm/h · 110 km/h', icon: Tornado, scenario: { scenarioName: 'Cyclonic Storm', rainfallMmPerHour: 85, windSpeedKmh: 110, visibilityMeters: 600, temperatureCelsius: 26, stormDurationHours: 10 } },
  { id: 'heat', label: 'Severe Heatwave', hint: '47 °C · 8 h', icon: Sun, scenario: { scenarioName: 'Severe Heatwave', rainfallMmPerHour: 0, windSpeedKmh: 14, visibilityMeters: 8000, temperatureCelsius: 47, stormDurationHours: 8 } },
];

const STATUSES: NodeStatus[] = ['healthy', 'at-risk', 'broken', 'delayed', 'cancelled', 'recovered'];
/** Twin statuses arrive as plain strings; anything unknown renders as healthy. */
export const asStatus = (s: string): NodeStatus => (STATUSES.includes(s as NodeStatus) ? (s as NodeStatus) : 'healthy');
