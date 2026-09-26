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
import { demoBackend, DemoNotFoundError } from '@/services/demoBackend';

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
  proposedRecoveryId?: string | null;
}

export interface DisruptionExtractNodeInput {
  id: string;
  title: string;
  label: string;
  provider: string;
  category: string;
}

export interface DisruptionExtractResult {
  type: string;
  delayMinutes?: number;
  nodeId?: string;
  source: 'llm' | 'fallback';
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

export async function askAssistant(tripId: string, message: string): Promise<AssistantAnswer> {
  if (isDemo()) return viaDemo(() => demoBackend.askAssistant(tripId, message));
  return post<AssistantAnswer>('/api/assistant', { tripId, message });
}

export async function extractDisruptionReport(
  tripId: string,
  message: string,
  nodes: DisruptionExtractNodeInput[]
): Promise<DisruptionExtractResult> {
  return post<DisruptionExtractResult>('/api/assistant/extract-disruption', {
    tripId,
    message,
    nodes,
  });
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
