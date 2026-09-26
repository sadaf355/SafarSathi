import type {
  Trip,
  Disruption,
  RecoveryOption,
  RiskScore,
  RiskCardData,
  Alert,
  Booking,
  ActivityEvent,
  Notification,
  TravelerPreferences,
} from '@/types';
import { getStoredToken } from '@/lib/authStorage';
import { demoBackend, DemoConflictError, DemoNotFoundError } from '@/services/demoBackend';

export const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://127.0.0.1:8008';

/** 'live' talks to the FastAPI backend; 'demo' serves the same contract from
 * the in-memory offline demo (services/demoBackend.ts). Chosen at sign-in. */
export type DataMode = 'live' | 'demo';
let dataMode: DataMode = 'live';

export function setDataMode(mode: DataMode) {
  dataMode = mode;
}

export function getDataMode(): DataMode {
  return dataMode;
}

const isDemo = () => dataMode === 'demo';

async function viaDemo<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call();
  } catch (err) {
    if (err instanceof DemoNotFoundError) throw new ApiError(err.message, 404);
    if (err instanceof DemoConflictError) throw new ApiError(err.message, 409);
    throw err;
  }
}

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

const DEFAULT_TIMEOUT_MS = 15000;
// Render's free tier spins the backend down after inactivity; waking it back
// up can take up to ~60s. A single short-timeout request would fail during
// that window, so a request that times out gets one retry with a much longer
// timeout instead of surfacing an error the user can't do anything about.
const COLD_START_TIMEOUT_MS = 55000;

let coldStartHandler: (() => void) | null = null;

// Lets the UI show a "waking up the server" notice while a cold-start retry
// is in flight, instead of the request silently taking up to a minute.
export function onColdStartRetry(handler: (() => void) | null) {
  coldStartHandler = handler;
}

async function attempt<T>(path: string, options: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const token = getStoredToken();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('The SafarSathi backend timed out. Please try again.', 0);
    }
    throw new ApiError('Could not reach the SafarSathi backend. Is it running on ' + API_BASE_URL + '?', 0);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let detail = response.statusText || `Request failed (${response.status})`;
    let details: unknown = undefined;
    try {
      const body = await response.json();
      if (typeof body?.detail === 'string') {
        detail = body.detail;
      } else if (Array.isArray(body?.detail)) {
        const joined = body.detail.map((d: { msg?: string }) => d.msg ?? '').filter(Boolean).join(', ');
        if (joined) detail = joined;
        details = body.detail;
      }
    } catch {
      // response had no JSON body - keep the status text
    }
    throw new ApiError(detail, response.status, details);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  try {
    return await attempt<T>(path, options, DEFAULT_TIMEOUT_MS);
  } catch (err) {
    // status 0 = client-side network/abort failure, not a real 4xx/5xx from
    // the server - exactly what a cold, still-waking backend looks like.
    if (err instanceof ApiError && err.status === 0) {
      coldStartHandler?.();
      return await attempt<T>(path, options, COLD_START_TIMEOUT_MS);
    }
    throw err;
  }
}

function get<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'GET' });
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined });
}

function del<T>(path: string): Promise<T> {
  return request<T>(path, { method: 'DELETE' });
}

export interface TripSummary {
  id: string;
  name: string;
  route: string;
  startDate: string;
  endDate: string;
  tripValue: number;
  healthScore: number;
  status: Trip['status'];
  nodeCount: number;
  edgeCount: number;
}

export interface ImpactEntry {
  nodeId: string;
  status: string;
  reason: string | null;
  causedBy: string | null;
  availableBufferMinutes: number | null;
  requiredBufferMinutes: number | null;
}

export interface PropagationResult {
  disruption: Disruption;
  impacts: ImpactEntry[];
  sequence: string[];
  tripHealthScore: number;
}

export interface RiskAnalysis {
  score: RiskScore;
  cards: RiskCardData[];
  alerts: Alert[];
}

export interface ApplyRecoveryResult {
  trip: Trip;
  appliedRecovery: RecoveryOption;
  activityEvent: ActivityEvent;
  notification: Notification;
}

export interface AssistantReferenceOut {
  type: 'node' | 'recovery' | 'risk';
  id: string;
  label: string;
}

export interface AssistantAnswer {
  content: string;
  references: AssistantReferenceOut[];
  source: 'llm' | 'deterministic';
}

export interface DisruptionRequest {
  type: string;
  primaryNodeId?: string;
  delayMinutes?: number;
}

export async function listTrips(): Promise<TripSummary[]> {
  if (isDemo()) return viaDemo(() => demoBackend.listTrips());
  return get<TripSummary[]>('/api/trips');
}

export interface TripCreateRequest {
  name: string;
  origin: string;
  destination: string;
  startDate: string;
  endDate: string;
}

export async function createTrip(req: TripCreateRequest): Promise<Trip> {
  if (isDemo()) return viaDemo(() => demoBackend.createTrip(req));
  return post<Trip>('/api/trips', req);
}

export interface FlightCreateRequest {
  category: 'flight';
  title: string;
  provider: string;
  confirmation: string;
  originCode: string;
  destinationCode: string;
  scheduledStart: string;
  scheduledEnd: string;
  cost: number;
}

export interface HotelCreateRequest {
  category: 'hotel';
  title: string;
  provider: string;
  confirmation: string;
  location: string;
  scheduledStart: string;
  scheduledEnd: string;
  cost: number;
  /** Optional coordinates for the itinerary map (see lib/geocoding.ts). */
  lat?: number;
  lng?: number;
}

export interface ActivityCreateRequest {
  category: 'activity';
  title: string;
  provider: string;
  confirmation: string;
  location: string;
  scheduledStart: string;
  scheduledEnd: string;
  cost: number;
  /** Optional coordinates for the itinerary map (see lib/geocoding.ts). */
  lat?: number;
  lng?: number;
}

export interface TransferCreateRequest {
  category: 'transfer';
  title: string;
  provider: string;
  confirmation: string;
  originCode?: string;
  destinationCode?: string;
  location?: string;
  scheduledStart: string;
  scheduledEnd: string;
  cost: number;
  /** Optional coordinates for the itinerary map (see lib/geocoding.ts). */
  lat?: number;
  lng?: number;
}

export type NodeCreateRequest =
  | FlightCreateRequest
  | HotelCreateRequest
  | ActivityCreateRequest
  | TransferCreateRequest;

export async function addFlightNode(tripId: string, req: FlightCreateRequest): Promise<Trip> {
  return addNode(tripId, req);
}

export async function addNode(tripId: string, req: NodeCreateRequest): Promise<Trip> {
  if (isDemo()) return viaDemo(() => demoBackend.addNode(tripId, req));
  return post<Trip>(`/api/trips/${tripId}/nodes`, req);
}

export async function deleteNode(tripId: string, nodeId: string): Promise<Trip> {
  if (isDemo()) return viaDemo(() => demoBackend.deleteNode(tripId, nodeId));
  return del<Trip>(`/api/trips/${tripId}/nodes/${nodeId}`);
}

export interface TripExport {
  exportedAt: string;
  version: string;
  trip: Trip;
  bookings: Booking[];
}

export async function exportTrip(tripId: string): Promise<TripExport> {
  if (isDemo()) return viaDemo(() => demoBackend.exportTrip(tripId));
  return get<TripExport>(`/api/trips/${tripId}/export`);
}

export async function getItinerary(tripId: string): Promise<Trip> {
  if (isDemo()) return viaDemo(() => demoBackend.getItinerary(tripId));
  return get<Trip>(`/api/trips/${tripId}`);
}

export async function getGraph(tripId: string): Promise<Trip> {
  if (isDemo()) return viaDemo(() => demoBackend.getItinerary(tripId));
  return get<Trip>(`/api/trips/${tripId}/graph`);
}

export async function getRiskAnalysis(tripId: string): Promise<RiskAnalysis> {
  if (isDemo()) return viaDemo(() => demoBackend.getRiskAnalysis(tripId));
  return get<RiskAnalysis>(`/api/trips/${tripId}/risks`);
}

export async function getBookings(tripId: string): Promise<Booking[]> {
  if (isDemo()) return viaDemo(() => demoBackend.getBookings(tripId));
  return get<Booking[]>(`/api/trips/${tripId}/bookings`);
}

export async function getActivityLog(tripId: string): Promise<ActivityEvent[]> {
  if (isDemo()) return viaDemo(() => demoBackend.getActivityLog(tripId));
  return get<ActivityEvent[]>(`/api/trips/${tripId}/activity`);
}

export async function getNotifications(tripId: string): Promise<Notification[]> {
  if (isDemo()) return viaDemo(() => demoBackend.getNotifications(tripId));
  return get<Notification[]>(`/api/trips/${tripId}/notifications`);
}

export async function markNotificationsRead(tripId: string): Promise<void> {
  if (isDemo()) return viaDemo(() => demoBackend.markNotificationsRead(tripId));
  await post<void>(`/api/trips/${tripId}/notifications/read`);
}

export async function getPreferences(tripId: string): Promise<TravelerPreferences> {
  if (isDemo()) return viaDemo(() => demoBackend.getPreferences(tripId));
  return get<TravelerPreferences>(`/api/trips/${tripId}/preferences`);
}

export async function setPreferences(tripId: string, preferences: TravelerPreferences): Promise<void> {
  if (isDemo()) return viaDemo(() => demoBackend.setPreferences(tripId, preferences));
  await post<void>(`/api/trips/${tripId}/preferences`, preferences);
}

export async function triggerDisruption(tripId: string, req: DisruptionRequest): Promise<PropagationResult> {
  if (isDemo()) return viaDemo(() => demoBackend.triggerDisruption(tripId, req));
  return post<PropagationResult>(`/api/trips/${tripId}/disruptions`, req);
}

export async function simulateDisruption(tripId: string, req: DisruptionRequest): Promise<PropagationResult> {
  if (isDemo()) return viaDemo(() => demoBackend.simulateDisruption(tripId, req));
  return post<PropagationResult>(`/api/trips/${tripId}/simulate`, req);
}

export async function repropagate(tripId: string): Promise<PropagationResult> {
  if (isDemo()) return viaDemo(() => demoBackend.repropagate(tripId));
  return post<PropagationResult>(`/api/trips/${tripId}/propagate`);
}

export async function generateRecoveryOptions(tripId: string): Promise<RecoveryOption[]> {
  if (isDemo()) return viaDemo(() => demoBackend.generateRecoveryOptions(tripId));
  return post<RecoveryOption[]>(`/api/trips/${tripId}/recovery-options/generate`);
}

export async function applyRecovery(tripId: string, recoveryId: string): Promise<ApplyRecoveryResult> {
  if (isDemo()) return viaDemo(() => demoBackend.applyRecovery(tripId, recoveryId));
  return post<ApplyRecoveryResult>(`/api/trips/${tripId}/recovery/apply`, { recoveryId });
}

export async function resetTrip(tripId: string): Promise<Trip> {
  if (isDemo()) return viaDemo(() => demoBackend.resetTrip(tripId));
  return post<Trip>(`/api/trips/${tripId}/reset`);
}

export interface RecoveryNarrative {
  executiveSummary: string | null;
  narrative: string | null;
  topOptionId: string | null;
  optionNotes: Record<string, string>;
  source: 'llm' | 'deterministic';
}

export interface DisruptionExtraction {
  type: string | null;
  delayMinutes: number | null;
  flightNumber: string | null;
  gate: string | null;
  primaryNodeId: string | null;
  primaryNodeLabel: string | null;
  confidence: number;
  matchedSignals: string[];
  summary: string;
  source: 'heuristic' | 'llm';
}

export async function getRecoveryNarrative(tripId: string): Promise<RecoveryNarrative> {
  if (isDemo()) return viaDemo(() => demoBackend.getRecoveryNarrative(tripId));
  return post<RecoveryNarrative>('/api/assistant/recovery-narrative', { tripId });
}

/** Parse an airline SMS / email into a disruption. Live backend only; the
 * offline demo rejects so callers fall back to their local parser. */
export async function extractDisruption(text: string, tripId?: string): Promise<DisruptionExtraction> {
  if (isDemo()) throw new ApiError('Disruption extraction needs the live backend.', 501);
  return post<DisruptionExtraction>('/api/assistant/extract-disruption', { text, tripId });
}

export async function askAssistant(tripId: string, message: string): Promise<AssistantAnswer> {
  if (isDemo()) return viaDemo(() => demoBackend.askAssistant(tripId, message));
  return post<AssistantAnswer>('/api/assistant', { tripId, message });
}

// ---- Weather, social signals & the weather Digital Twin ----------------------------

export interface HourlyWeather {
  time: string;
  temperatureC: number;
  precipitationProbability: number;
  rainfallMm: number;
  windSpeedKmh: number;
  cloudCover: number;
  visibilityM: number;
  weatherCode: number;
  label: string;
  riskPercent: number;
}

export interface WeatherForecast {
  lat: number;
  lng: number;
  source: 'open-meteo' | 'fallback';
  current: HourlyWeather;
  hourly: HourlyWeather[];
}

export interface NodeWeather {
  nodeId: string;
  title: string;
  category: string;
  location: string;
  lat: number | null;
  lng: number | null;
  scheduledStart: string;
  conditions: HourlyWeather | null;
  /** Weather Vulnerability Index (0-100): how exposed this kind of booking is. */
  vulnerabilityIndex: number;
  /** WVI x forecast risk (0-100). */
  exposure: number;
  source: 'open-meteo' | 'fallback' | 'unavailable';
}

export interface TripWeather {
  tripId: string;
  nodes: NodeWeather[];
  maxExposure: number;
  mostExposedNodeId: string | null;
  summary: string;
}

export type SocialSignalType = 'airport_congestion' | 'road_waterlogging' | 'transit_strike' | 'weather_warning' | 'crowd_surge' | 'all_clear';

export interface SocialSignal {
  id: string;
  type: SocialSignalType;
  location: string;
  lat: number | null;
  lng: number | null;
  nodeIds: string[];
  urgency: 'low' | 'medium' | 'high' | 'critical';
  sentiment: number;
  intensity: number;
  text: string;
  minutesAgo: number;
  source: 'simulated';
}

export interface SocialSignals {
  tripId: string;
  signals: SocialSignal[];
  overallSentiment: number;
  summary: string;
}

export interface WeatherScenarioRequest {
  scenarioName: string;
  rainfallMmPerHour: number;
  windSpeedKmh: number;
  visibilityMeters: number;
  temperatureCelsius: number;
  stormDurationHours: number;
  affectedNodeId?: string | null;
  stormStart?: string | null;
}

export interface TwinStateSummary {
  healthScore: number;
  atRiskCommitments: number;
  totalCommitments: number;
  costExposure: number;
}

export interface TwinNode {
  nodeId: string;
  title: string;
  category: string;
  mode: string;
  liveStatus: string;
  twinStatus: string;
  reason: string | null;
  directHit: boolean;
  driver: string | null;
  delayMinutes: number;
  lat: number | null;
  lng: number | null;
}

export interface TwinRisk {
  nodeId: string;
  label: string;
  probability: number;
  low: number;
  high: number;
}

export interface CascadeLink {
  /** "weather" for a direct weather hit. */
  fromNodeId: string;
  toNodeId: string;
  status: string;
}

export interface TwinChange {
  nodeId: string;
  title: string;
  changeType: string;
  newStart: string;
  newEnd: string;
  costDelta: number;
  description: string;
}

export interface TwinOption {
  id: string;
  name: string;
  strategy: string;
  description: string;
  changes: TwinChange[];
  deltaCost: number;
  timeImpactMinutes: number;
  commitmentsPreserved: number;
  totalCommitments: number;
  healthScore: number;
  residualFailures: number;
  score: number;
  recommended: boolean;
  notes: string[];
}

export interface DigitalTwinSimulation {
  simulationId: string;
  tripId: string;
  scenarioName: string;
  severity: number;
  stormWindowStart: string;
  stormWindowEnd: string;
  live: TwinStateSummary;
  twin: TwinStateSummary;
  healthDelta: number;
  nodes: TwinNode[];
  risks: TwinRisk[];
  cascade: CascadeLink[];
  options: TwinOption[];
  socialSignals: SocialSignals;
  explanation: string;
  explanationSource: 'nugen' | 'heuristic';
  model: string | null;
  mitigation: string[];
  mitigationSource: 'nugen' | 'heuristic';
  expiresAt: string;
}

export interface DigitalTwinApplyResult {
  trip: Trip;
  appliedOption: TwinOption;
  validation: TwinStateSummary;
  allConnectionsValid: boolean;
}

export async function getWeather(lat: number, lng: number, hours = 24): Promise<WeatherForecast> {
  return get<WeatherForecast>(`/api/weather?lat=${lat}&lng=${lng}&hours=${hours}`);
}

export async function getTripWeather(tripId: string): Promise<TripWeather> {
  if (isDemo()) return viaDemo(() => demoBackend.getTripWeather(tripId));
  return get<TripWeather>(`/api/trips/${tripId}/weather`);
}

export async function getSocialSignals(tripId: string): Promise<SocialSignals> {
  if (isDemo()) return viaDemo(() => demoBackend.getSocialSignals(tripId));
  return get<SocialSignals>(`/api/trips/${tripId}/social-signals`);
}

export async function simulateDigitalTwin(tripId: string, req: WeatherScenarioRequest): Promise<DigitalTwinSimulation> {
  if (isDemo()) return viaDemo(() => demoBackend.simulateDigitalTwin(tripId, req));
  return post<DigitalTwinSimulation>(`/api/trips/${tripId}/digital-twin/simulate`, req);
}

export async function applyDigitalTwin(tripId: string, simulationId: string, optionId: string): Promise<DigitalTwinApplyResult> {
  if (isDemo()) return viaDemo(() => demoBackend.applyDigitalTwin(tripId, simulationId, optionId));
  return post<DigitalTwinApplyResult>(`/api/trips/${tripId}/digital-twin/apply`, { simulationId, optionId });
}

export async function checkHealth(): Promise<boolean> {
  try {
    await get<{ status: string }>('/api/health');
    return true;
  } catch {
    return false;
  }
}

export interface AuthResponse {
  token: string;
  travelerId: string;
  name: string;
  email: string;
}

export interface TravelerProfile {
  travelerId: string;
  name: string;
  email: string;
  homeAirport: string;
  loyaltyTier: string;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  return post<AuthResponse>('/api/auth/login', { email, password });
}

export async function register(name: string, email: string, password: string): Promise<AuthResponse> {
  return post<AuthResponse>('/api/auth/register', { name, email, password });
}

export async function getDemoAccount(): Promise<AuthResponse> {
  return get<AuthResponse>('/api/auth/demo-account');
}

export async function getMe(): Promise<TravelerProfile> {
  if (isDemo()) return demoBackend.profile();
  return get<TravelerProfile>('/api/auth/me');
}
