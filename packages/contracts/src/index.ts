import { z } from 'zod';

export const workspaceSchema = z.enum([
  'customer',
  'doctor',
  'clinic_member',
  'driver',
  'platform_admin',
]);
export type Workspace = z.infer<typeof workspaceSchema>;
export const minorUnitsSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/, 'المبلغ يجب أن يكون عددًا صحيحًا غير سالب');
export const currencySchema = z.literal('IQD');

// IQD has three minor decimal places. Never convert financial storage to float.
export function formatIqd(minorUnits: string): string {
  const value = BigInt(minorUnitsSchema.parse(minorUnits));
  const whole = new Intl.NumberFormat('ar-IQ').format(value / 1000n);
  const fraction = value % 1000n;
  return `${whole}${
    fraction
      ? `٫${fraction
          .toString()
          .padStart(3, '0')
          .replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]!)}`
      : ''
  } د.ع`;
}

export const financialEventSchema = z
  .object({
    eventId: z.uuid(),
    occurredAt: z.iso.datetime(),
    aggregateId: z.uuid(),
    aggregateType: z.enum(['order', 'appointment', 'ride', 'donation']),
    aggregateVersion: z.number().int().positive(),
    type: z.enum([
      'PaymentCaptured',
      'OrderRefunded',
      'RideCompleted',
      'DonationConfirmed',
    ]),
    actorId: z.uuid(),
    clinicId: z.uuid(),
    ledgerEntityId: z.uuid(),
    idempotencyKey: z.string().min(16).max(200),
    currency: currencySchema,
    amountMinor: minorUnitsSchema,
  })
  .strict();
export type FinancialEvent = z.infer<typeof financialEventSchema>;

export const customerDemoSchema = z.object({
  mode: z.literal('design-demo'),
  pets: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      species: z.string(),
      description: z.string(),
      color: z.enum(['mint', 'peach', 'lavender']),
    }),
  ),
  appointments: z.array(
    z.object({
      id: z.string(),
      petId: z.string(),
      title: z.string(),
      clinic: z.string(),
      time: z.string(),
      date: z.string(),
    }),
  ),
});
export type CustomerDemo = z.infer<typeof customerDemoSchema>;
export const financeDemoSchema = z.object({
  mode: z.literal('design-demo'),
  clinicId: z.literal('demo-clinic'),
  currency: currencySchema,
  invoices: z.array(
    z.object({
      id: z.string(),
      customer: z.string(),
      description: z.string(),
      issuedAt: z.string(),
      amountMinor: minorUnitsSchema,
      status: z.enum(['paid', 'pending', 'refunded']),
    }),
  ),
});
export type FinanceDemo = z.infer<typeof financeDemoSchema>;

export const identityMeSchema = z.object({
  user: z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.email(),
    emailVerified: z.boolean(),
    twoFactorEnabled: z.boolean(),
  }),
  sessionId: z.uuid(),
  workspaces: z.array(
    z.object({
      id: z.string(),
      persona: workspaceSchema,
      name: z.string(),
      clinicId: z.uuid().nullable(),
      capabilities: z.array(z.string()),
    }),
  ),
  activeWorkspace: z.object({
    id: z.string(),
    persona: workspaceSchema,
    name: z.string(),
    clinicId: z.uuid().nullable(),
    capabilities: z.array(z.string()),
  }),
});
export type IdentityMe = z.infer<typeof identityMeSchema>;
export interface ProfessionalApplication {
  id: string;
  kind: 'clinic' | 'doctor' | 'driver';
  display_name: string;
  registration_number: string;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  clinic_id: string | null;
  review_reason: string | null;
  version: number;
  notes?: string;
  applicant?: string;
}
export interface Invitation {
  id: string;
  clinic_id: string;
  name: string;
  capabilities: string[];
  expires_at: string;
}
export interface ClinicInfo {
  id: string;
  name: string;
  capabilities: string[];
  branches: { id: string; name: string; city: string }[];
}

const short = z.string().trim().max(100);
const text = z.string().trim().max(3000);
export const petInputSchema = z
  .object({
    name: short.min(1),
    species: z.enum(['cat', 'dog', 'bird', 'rabbit', 'other']),
    breed: short.default(''),
    sex: z.enum(['female', 'male', 'unknown']),
    birthDate: z.iso.date().nullable().default(null),
    birthEstimated: z.boolean().default(false),
    weightGrams: z
      .number()
      .int()
      .positive()
      .max(1000000)
      .nullable()
      .default(null),
    neutered: z.boolean().default(false),
    color: short.default(''),
    microchip: short.default(''),
    allergies: text.default(''),
    chronicConditions: text.default(''),
    emergencyContact: z.string().trim().max(300).default(''),
  })
  .strict()
  .refine(
    (v) => !v.birthDate || v.birthDate <= new Date().toISOString().slice(0, 10),
    { message: 'تاريخ الميلاد في المستقبل' },
  );
export type PetInput = z.infer<typeof petInputSchema>;
export interface Pet {
  id: string;
  owner_id: string;
  name: string;
  species: string;
  breed: string;
  sex: string;
  birth_date: string | null;
  birth_estimated: boolean;
  weight_grams: number | null;
  neutered: boolean;
  color: string;
  microchip?: string;
  allergies?: string;
  chronic_conditions?: string;
  emergency_contact?: string;
  archived_at: string | null;
  version: number;
  scopes: string[];
}
export const visitContentSchema = z
  .object({
    complaint: text.min(1),
    subjective: text,
    objective: text,
    assessment: text.min(1),
    plan: text.min(1),
    prescriptions: z
      .array(
        z
          .object({
            medicine: short.min(1),
            instructions: text.min(1),
            duration: short.min(1),
          })
          .strict(),
      )
      .max(20),
    vaccines: z
      .array(
        z
          .object({
            name: short.min(1),
            administeredOn: z.iso.date(),
            batch: short,
            nextDueOn: z.iso.date().nullable(),
          })
          .strict()
          .refine(
            (v) =>
              v.administeredOn <= new Date().toISOString().slice(0, 10) &&
              (!v.nextDueOn || v.nextDueOn > v.administeredOn),
          ),
      )
      .max(20),
    labs: z
      .array(
        z
          .object({
            test: short.min(1),
            status: z.enum(['requested', 'reviewed']),
            result: text,
          })
          .strict()
          .refine((v) => v.status !== 'reviewed' || v.result.length > 0),
      )
      .max(20),
    followUps: z
      .array(
        z.object({ title: short.min(1), dueAt: z.iso.datetime() }).strict(),
      )
      .max(20),
  })
  .strict();
export type VisitContent = z.infer<typeof visitContentSchema>;
export interface Encounter {
  id: string;
  appointment_id: string;
  doctor_id: string;
  doctor_name: string;
  clinic_name: string;
  content: VisitContent;
  version: number;
  signed_at: string | null;
  lab_orders: {
    id: string;
    test: string;
    status: 'requested' | 'reviewed';
    result: string;
    reviewed_at: string | null;
  }[];
  addenda: { id: string; note: string; signed_at: string }[];
}
export interface CareTask {
  id: string;
  title: string;
  due_at: string;
  status: 'planned' | 'due' | 'completed' | 'skipped' | 'expired';
  expires_at?: string | null;
  created_by: string;
  encounter_id: string | null;
}
export interface CareAppointment {
  visit_mode: 'clinic' | 'home';
  home_visit_id: string | null;
  home_status: HomeVisitBooking['status'] | null;
  id: string;
  pet_id: string;
  pet_name: string;
  clinic_id: string;
  doctor_id: string;
  doctor_name: string;
  clinic_name: string;
  service_name: string;
  starts_at: string;
  ends_at: string;
  status: 'confirmed' | 'completed' | 'cancelled' | 'no_show';
  attendance_state: 'scheduled' | 'checked_in' | 'in_progress';
  version: number;
  encounter_id: string | null;
}
export interface HomeVisitOffer {
  id: string;
  clinic_id: string;
  branch_id: string;
  service_id: string;
  doctor_id: string;
  name: string;
  description: string;
  city: string;
  district: string;
  species: string[];
  service_minor: string;
  travel_minor: string;
  total_minor: string;
  duration_minutes: number;
  buffer_minutes: number;
  travel_minutes: number;
  active: boolean;
  version: number;
  doctor_name: string;
  clinic_name: string;
  branch_name: string;
  service_name: string;
}
export interface HomeVisitSlot {
  id: string;
  offer_id: string;
  starts_at: string;
  ends_at: string;
  cancelled_at?: string | null;
}
export interface HomeVisitBooking {
  id: string;
  appointment_id: string;
  offer_id: string;
  clinic_id: string;
  doctor_id: string;
  pet_id: string;
  user_id: string;
  pet_name: string;
  service_name: string;
  city: string;
  district: string;
  service_minor: string;
  travel_minor: string;
  total_minor: string;
  status: 'confirmed' | 'en_route' | 'arrived' | 'completed' | 'cancelled';
  version: number;
  starts_at: string;
  ends_at: string;
  occupied_from: string;
  occupied_until: string;
  attendance_state: CareAppointment['attendance_state'];
  appointment_version: number;
  medical_consent_until: string;
  doctor_name: string;
  clinic_name: string;
  offer_name: string;
  can_execute: boolean;
  contact_name: string | null;
  phone: string | null;
  address_line: string | null;
  notes: string | null;
}
export interface HomeVisitCatalog {
  offers: HomeVisitOffer[];
  slots: HomeVisitSlot[];
}
export interface HomeVisitManagement extends HomeVisitCatalog {
  admin: boolean;
  bookings: HomeVisitBooking[];
  branches: { id: string; name: string }[];
  services: { id: string; name: string }[];
  doctors: { id: string; name: string }[];
}
export interface AvailableSlot {
  id: string;
  clinic_id: string;
  clinic_name: string;
  doctor_id: string;
  doctor_name: string;
  service_name: string;
  branch_name: string;
  starts_at: string;
  ends_at: string;
  price_minor: string;
  buffer_minutes: number;
}
export interface CareDetail {
  pet: Pet;
  guardians: {
    user_id: string;
    name: string;
    email: string;
    scopes: string[];
  }[];
  consents: {
    clinic_id: string;
    doctor_id: string;
    doctor_name: string;
    clinic_name: string;
    expires_at: string;
  }[];
  appointments: CareAppointment[];
  encounters: Encounter[];
  tasks: CareTask[];
}
export interface DoctorClinic {
  id: string;
  name: string;
  branches: { id: string; name: string }[];
  services: { id: string; name: string; duration_minutes: number }[];
}
export interface CareResource {
  id: string;
  branch_id: string;
  name: string;
  active?: boolean;
}
export interface WorkingHoursRule {
  id: string;
  branch_id: string;
  service_id: string;
  resource_id: string | null;
  weekday: number;
  start_minute: number;
  end_minute: number;
}
export interface CareTimeOff {
  id: string;
  doctor_id: string | null;
  starts_at: string;
  ends_at: string;
  reason: string;
}
export interface DoctorPlanningData {
  rules: WorkingHoursRule[];
  timeOff: CareTimeOff[];
  resources: CareResource[];
}
export interface DoctorPublicProfile {
  specialty: string;
  bio: string;
  languages: string[];
}
export interface DoctorDirectoryEntry extends DoctorPublicProfile {
  id: string;
  name: string;
  clinic_id: string;
  clinic_name: string;
  branches: { id: string; name: string; city: string }[];
  services: {
    id: string;
    name: string;
    duration_minutes: number;
    price_minor: string;
  }[];
  review_count: number;
  rating: string | null;
}
export interface SafetyCard {
  id: string;
  contact_name: string;
  contact_phone: string;
  message: string;
  expires_at: string;
  revoked_at: string | null;
}
export interface PublicSafetyCard {
  pet_name: string;
  species: string;
  contact_name: string;
  contact_phone: string;
  message: string;
  expires_at: string;
}
export interface PetPassport {
  pet: Pick<
    Pet,
    'id' | 'name' | 'species' | 'breed' | 'birth_date' | 'microchip' | 'sex'
  >;
  exportedAt: string;
  visits: {
    id: string;
    signed_at: string;
    doctor_name: string;
    clinic_name: string;
    vaccines: VisitContent['vaccines'];
    prescriptions: VisitContent['prescriptions'];
    addenda: { id: string; note: string; signed_at: string }[];
  }[];
}
export interface CareCalendar {
  tasks: (CareTask & { pet_id: string; pet_name: string })[];
  appointments: (CareAppointment & { pet_name: string })[];
}

export function iqdToMinor(input: string) {
  const match = /^(0|[1-9]\d{0,8})(?:\.(\d{1,3}))?$/.exec(input.trim());
  if (!match) throw new Error('أدخل مبلغًا بالدينار حتى ثلاث منازل عشرية');
  return (
    BigInt(match[1]!) * 1000n +
    BigInt((match[2] ?? '').padEnd(3, '0'))
  ).toString();
}

export interface Product {
  category_id?: string | null;
  tags?: string[];
  classification?: { id: string; name: string; path: string[] } | null;
  id: string;
  clinic_id: string;
  name: string;
  description: string;
  species: string;
  price_minor: string;
  cost_minor?: string;
  available: number;
  clinic_name: string;
  sku?: string;
  on_hand?: number;
  reserved?: number;
  version?: number;
  active?: boolean;
  parent_product_id?: string | null;
  variant_label?: string;
  variant_attributes?: { name: string; value: string }[];
  matrix_dimensions?: VariantDimension[] | null;
  category?: string;
  brand?: string;
  barcode?: string;
  unit?: string;
  age_suitability?: string;
  specifications?: { name: string; value: string }[];
  images?: { asset_id: string; alt: string }[];
  city?: string;
  store_name?: string;
}
export interface Storefront {
  clinic_id: string;
  clinic_name: string;
  display_name: string;
  description: string;
  city: string;
  opening_hours: string;
  delivery_policy: string;
  return_policy: string;
  logo_asset_id: string | null;
  cover_asset_id: string | null;
  published?: boolean;
  version?: number;
}
export interface CustomerOrder {
  id: string;
  total_minor: string;
  subtotal_minor: string;
  discount_minor: string;
  tax_minor: string;
  status: string;
  mode: 'sandbox';
  created_at: string;
  children: {
    id: string;
    clinic_id: string;
    clinic_name: string;
    shipment?: Shipment | null;
    shipment_events?: { status: string; created_at: string }[];
    status: string;
    total_minor: string;
    subtotal_minor: string;
    discount_minor: string;
    tax_minor: string;
    tax_label: string;
    tax_bps: number;
    coupon_code: string | null;
    lines: {
      id: string;
      product_id: string;
      name: string;
      quantity: number;
      returned_quantity: number;
      unit_price: string;
      discount_minor: string;
      tax_minor: string;
      total_minor: string;
    }[];
  }[];
}
export interface CommerceData {
  products: Product[];
  orders: {
    id: string;
    status: string;
    total_minor: string;
    delivery_address?: string;
    shipment?: Shipment | null;
  }[];
  vendors: { id: string; name: string }[];
  purchases: {
    id: string;
    product_name: string;
    vendor_name: string;
    quantity: number;
    unit_cost: string;
    status: string;
  }[];
  returns: {
    id: string;
    product_name: string;
    quantity: number;
    reason: string;
    status: string;
  }[];
}
export interface FinanceReport {
  vendorBills?: {
    outstanding_minor?: string;
    paid_minor?: string;
    due_on?: string;
    id: string;
    vendor_name: string;
    product_name: string;
    quantity: number;
    unit_cost: string;
  }[];
  entityId: string;
  mode: string;
  balances: { code: string; name: string; debit: string; credit: string }[];
  journals: {
    id: string;
    description: string;
    status: string;
    effective_on: string;
    source_key: string;
    lines: { account: string; debit: string; credit: string }[];
  }[];
  approvals: {
    id: string;
    kind: string;
    status: string;
    created_by: string;
    reason: string;
  }[];
}
export interface SocialProfile {
  handle?: string;
  avatar_asset_id?: string | null;
  presence_enabled?: boolean;
  user_id: string;
  display_name: string;
  bio: string;
  privacy: 'public' | 'private';
}
export interface SocialPost {
  expires_at?: string | null;
  handle?: string;
  avatar_asset_id?: string | null;
  media?: { asset_id: string; kind: string; position: number }[];
  comments_count?: number;
  cursor_time?: string;
  asset_kind?: string | null;
  id: string;
  user_id: string;
  body: string;
  kind: string;
  visibility: string;
  created_at: string;
  asset_id: string | null;
  display_name: string;
  likes: number;
  liked: boolean;
  saved: boolean;
  version: number;
}
export interface SocialPerson extends SocialProfile {
  follow_status: string | null;
}
export interface SocialTimeline {
  items: SocialPost[];
  nextCursor: string | null;
}
export interface SocialProfileView {
  profile: SocialPerson;
  canView: boolean;
  counts: { posts: number; followers: number; following: number };
}
export interface SocialMessage {
  asset_id?: string | null;
  asset_kind?: string | null;
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
}
export interface SocialComment {
  id: string;
  body: string;
  display_name: string;
  created_at: string;
}
export interface Plan {
  id: string;
  clinic_id: string;
  service_id: string;
  name: string;
  price_minor: string;
  uses: number;
  valid_days: number;
  clinic_name: string;
  service_name: string;
  category: string;
  branch_id: string | null;
  branch_name: string | null;
  waiting_days: number;
  max_pause_days: number;
  version: number;
  active: boolean;
  entitlements: PlanEntitlement[];
}
export interface PlanEntitlement {
  service_id: string;
  service_name: string;
  uses: number;
  used?: number;
}
export interface BoardingUnit {
  max_weight_grams: number | null;
  vaccines_required: boolean;
  health_requirements: string;
  active: boolean;
  version: number;
  id: string;
  clinic_id: string;
  name: string;
  species: string;
  night_price: string;
  clinic_name: string;
}
export interface ServicesCatalog {
  plans: Plan[];
  units: BoardingUnit[];
}
export interface MyServices {
  subscriptions: {
    id: string;
    name: string;
    pet_name: string;
    status: string;
    uses_used: number;
    uses_total: number;
    expires_at: string;
    clinic_id: string;
    plan_id: string;
    valid_days: number;
    waiting_days: number;
    price_minor: string;
    state:
      | 'active'
      | 'waiting'
      | 'paused'
      | 'expired'
      | 'exhausted'
      | 'cancelled'
      | 'upgraded';
    branch_id: string | null;
    branch_name: string | null;
    available_at: string;
    paused_until: string | null;
    max_pause_days: number;
    pause_seconds: string;
    version: number;
    successor_id: string | null;
    created_at: string;
    entitlements: PlanEntitlement[];
  }[];
  boarding: {
    id: string;
    name: string;
    pet_name: string;
    starts_on: string;
    ends_on: string;
    status: string;
    total_minor: string;
  }[];
  transfers: {
    id: string;
    pet_id: string;
    name: string;
    from_id: string;
    to_id: string;
    expires_at: string;
  }[];
}
export interface AdoptionListing {
  version: number;
  id: string;
  title: string;
  description: string;
  city: string;
  requirements: string;
  pet_name: string;
  species: string;
  owner_id: string;
  status?: string;
}
export interface AdoptionApplication {
  id: string;
  title?: string;
  listing_id: string;
  private_details: string;
  status: string;
  reason: string | null;
  display_name?: string;
}
export interface RescueCase {
  id: string;
  title: string;
  kind: string;
  description: string;
  city: string;
  status: string;
  private_location?: string;
  clinic_id?: string | null;
}
export interface Campaign {
  version: number;
  donation_count: number;
  id: string;
  name: string;
  purpose: string;
  beneficiary: string;
  goal_minor: string;
  collected_minor: string;
  status: string;
}
export interface MyRescue {
  listings: AdoptionListing[];
  applications: AdoptionApplication[];
  cases: RescueCase[];
  donations: {
    id: string;
    name: string;
    amount_minor: string;
    status: string;
  }[];
}
export interface Ride {
  auto_dispatch?: boolean;
  route_quote_id?: string | null;
  id: string;
  scheduled_at?: string | null;
  pet_count?: number;
  transport_notes?: string;
  accompanying?: boolean;
  user_id: string;
  pet_id: string;
  pet_name: string;
  driver_id: string | null;
  city: string;
  origin_label: string;
  destination_label: string;
  fare_minor: string;
  driver_share: string;
  status: string;
}
export interface DriverHome {
  offers: {
    id: string;
    ride_id: string;
    expires_at: string;
    city: string;
    fare_minor: string;
    species: string;
  }[];
  mode: string;
  vehicle: {
    plate: string;
    description: string;
    city: string;
    expires_on: string;
    available: boolean;
    auto_dispatch?: boolean;
    capacity?: number;
    allowed_species?: string[];
    passenger_allowed?: boolean;
  } | null;
  requests: { id: string; city: string; fare_minor: string; species: string }[];
  walletMinor: string;
}
export interface AppNotification {
  id: string;
  title: string;
  read_at: string | null;
  created_at: string;
}
export interface MediaAsset {
  id: string;
  kind: string;
  status: string;
  created_at?: string;
  failure?: string | null;
}

export function usageRecognition(
  price: bigint,
  used: number,
  total: number,
): bigint {
  if (
    price < 0n ||
    !Number.isInteger(used) ||
    !Number.isInteger(total) ||
    total < 1 ||
    used < 0 ||
    used >= total
  )
    throw new Error('Invalid entitlement recognition');
  return (
    (price * BigInt(used + 1)) / BigInt(total) -
    (price * BigInt(used)) / BigInt(total)
  );
}
export function refundCommission(
  fee: bigint,
  sale: bigint,
  before: bigint,
  amount: bigint,
): bigint {
  if (
    fee < 0n ||
    sale < 0n ||
    fee > sale ||
    before < 0n ||
    amount < 0n ||
    before + amount > sale
  )
    throw new Error('Invalid refund allocation');
  return sale === 0n
    ? 0n
    : ((before + amount) * fee) / sale - (before * fee) / sale;
}

export interface InventoryData {
  purchases: (CommerceData['purchases'][number] & {
    received_quantity: number;
  })[];
  warehouses: {
    id: string;
    name: string;
    branch_id: string | null;
    is_primary: boolean;
  }[];
  products: {
    id: string;
    name: string;
    sku: string;
    on_hand: number;
    reserved: number;
    eligible: number;
    available: number;
  }[];
  layers: {
    id: string;
    product_id: string;
    product_name: string;
    warehouse_id: string;
    warehouse_name: string;
    remaining: number;
    unit_cost: string;
    batch_code: string;
    expires_on: string | null;
    quarantined: boolean;
    expired: boolean;
  }[];
  requests: {
    id: string;
    product_name: string;
    quantity: number;
    reason: string;
    created_by: string;
    status: string;
  }[];
  receipts: {
    id: string;
    po_id: string;
    quantity: number;
    product_name: string;
    created_at: string;
  }[];
  transfers: { id: string; quantity: number; created_at: string }[];
}
export interface FinancialStatements {
  asOf: string;
  mode: 'sandbox';
  balances: FinanceReport['balances'];
  statements: {
    assets: string;
    liabilities: string;
    equity: string;
    revenue: string;
    expenses: string;
    profit: string;
    difference: string;
  };
  payables: {
    id: string;
    vendor_name: string;
    due_on: string;
    outstanding_minor: string;
    days_overdue: number;
  }[];
  aging: Record<string, string>;
}

export interface DeliveryAddress {
  id: string;
  label: string;
  contact_name: string;
  phone: string;
  province: string;
  city: string;
  area: string;
  street: string;
  building: string;
  landmark: string;
  version: number;
}
export interface Shipment {
  carrier: string;
  tracking_code: string;
  version: number;
}

/** Exact minor-unit apportionment; caller supplies a stable line order. */
export function allocateDiscount(gross: bigint[], discount: bigint): bigint[] {
  const sum = gross.reduce((a, b) => a + b, 0n);
  if (gross.some((v) => v < 0n) || discount < 0n || discount > sum)
    throw new Error('Invalid discount allocation');
  if (sum === 0n) return gross.map(() => 0n);
  const result = gross.map((v) => (v * discount) / sum);
  let rest = discount - result.reduce((a, b) => a + b, 0n);
  const ranked = gross
    .map((v, index) => ({ index, remainder: (v * discount) % sum }))
    .sort((a, b) =>
      a.remainder === b.remainder
        ? a.index - b.index
        : a.remainder > b.remainder
          ? -1
          : 1,
    );
  for (const { index } of ranked) {
    if (rest === 0n) break;
    result[index] = result[index]! + 1n;
    rest--;
  }
  return result;
}
export function exclusiveTax(net: bigint, bps: number): bigint {
  if (net < 0n || !Number.isInteger(bps) || bps < 0 || bps > 10000)
    throw new Error('Invalid tax');
  return (net * BigInt(bps) + 5000n) / 10000n;
}
export function quantityRefund(
  total: bigint,
  quantity: number,
  before: number,
  count: number,
): bigint {
  if (
    total < 0n ||
    ![quantity, before, count].every(Number.isSafeInteger) ||
    quantity < 1 ||
    before < 0 ||
    count < 1 ||
    before + count > quantity
  )
    throw new Error('Invalid quantity refund');
  return (
    (total * BigInt(before + count)) / BigInt(quantity) -
    (total * BigInt(before)) / BigInt(quantity)
  );
}
export interface CouponInput {
  clinicId: string;
  code: string;
}
export interface CheckoutQuote {
  quoteHash: string;
  subtotalMinor: string;
  discountMinor: string;
  taxMinor: string;
  totalMinor: string;
  groups: {
    clinicId: string;
    clinicName: string;
    couponCode: string | null;
    taxBps: number;
    taxLabel: string;
    subtotalMinor: string;
    discountMinor: string;
    taxMinor: string;
    totalMinor: string;
    lines: {
      productId: string;
      quantity: number;
      unitPriceMinor: string;
      discountMinor: string;
      taxMinor: string;
      totalMinor: string;
    }[];
  }[];
}
export interface CommercePricing {
  tax: { rate_bps: number; label: string; version: number };
  coupons: {
    id: string;
    code: string;
    kind: 'fixed' | 'percent';
    value: string;
    minimum_minor: string;
    maximum_discount_minor: string | null;
    starts_at: string;
    ends_at: string;
    max_uses: number;
    max_per_user: number;
    active: boolean;
    version: number;
    uses: number;
  }[];
}

export interface GroomingAddon {
  code: string;
  name: string;
  priceMinor: string;
  minutes: number;
}
export interface GroomingOffer {
  id: string;
  active: boolean;
  version: number;
  clinic_id: string;
  branch_id: string;
  name: string;
  description: string;
  species: string[];
  price_minor: string;
  duration_minutes: number;
  addons: GroomingAddon[];
  clinic_name?: string;
  branch_name?: string;
  city?: string;
}
export interface GroomingSlot {
  id: string;
  active?: boolean;
  version?: number;
  service_id: string;
  starts_at: string;
  ends_at: string;
  staff_name?: string;
  resource_name?: string;
}
export interface GroomingBooking {
  id: string;
  slot_id: string;
  clinic_id: string;
  pet_id: string;
  pet_name: string;
  staff_name: string;
  resource_name: string;
  clinic_name?: string;
  service_name: string;
  total_minor: string;
  addons: GroomingAddon[];
  starts_at: string;
  ends_at: string;
  status: 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
  photos_consent: boolean;
  photos: string[];
  review?: { rating: number; body: string } | null;
}
export interface GroomingCatalog {
  services: GroomingOffer[];
  slots: GroomingSlot[];
}
export interface GroomingManagement extends GroomingCatalog {
  branches: { id: string; name: string }[];
  resources: { id: string; branch_id: string; name: string }[];
  staff: { id: string; name: string }[];
  bookings: GroomingBooking[];
}
export interface CareArticle {
  id: string;
  clinic_id: string;
  clinic_name: string;
  revision: number;
  version: number;
  state: 'draft' | 'approved' | 'rejected';
  published: boolean;
  title: string;
  body: string;
  species: string;
  age_group: string;
  sources: string[];
  author_id: string;
  reviewer_id: string | null;
  reviewer_name: string | null;
  reviewed_at: string | null;
  review_note: string | null;
}
export interface ContentCorrection {
  id: string;
  article_id: string;
  revision: number;
  title: string;
  reason: string;
  response: string | null;
  status: 'pending' | 'resolved';
  created_at: string;
}
export interface CareLibraryManagement {
  articles: CareArticle[];
  corrections: ContentCorrection[];
}

export interface BoardingBooking {
  id: string;
  unit_id: string;
  pet_id: string;
  user_id: string;
  clinic_id: string;
  clinic_name: string;
  unit_name: string;
  pet_name: string;
  night_price: string;
  total_minor: string;
  starts_on: string;
  ends_on: string;
  max_weight_grams: number | null;
  vaccines_required: boolean;
  health_requirements: string;
  policy_accepted: boolean;
  version: number;
  status: 'confirmed' | 'checked_in' | 'completed' | 'cancelled';
  review_id: string | null;
  review_decision: 'approved' | 'rejected' | null;
  review_valid_through: string | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
}
export interface BoardingAccess {
  owner: boolean;
  doctor: boolean;
  admin: boolean;
  operator: boolean;
}
export interface BoardingDetailData {
  booking: BoardingBooking;
  access: BoardingAccess;
  reviews: {
    id: string;
    doctor_id: string;
    doctor_name: string;
    decision: 'approved' | 'rejected';
    valid_through: string;
    created_at: string;
    weight_grams: number | null;
    vaccines_checked: boolean | null;
    notes: string | null;
  }[];
  incidents: {
    id: string;
    kind: 'incident' | 'resolution';
    severity: 'low' | 'attention' | 'urgent';
    body: string;
    resolves_id: string | null;
    created_at: string;
    actor_name: string;
  }[];
}
export interface BoardingManagementData {
  access: Omit<BoardingAccess, 'owner'>;
  bookings: BoardingBooking[];
  units: BoardingUnit[];
}

export interface VariantDimension {
  name: string;
  values: string[];
}
export interface VariantChoice {
  indexes: number[];
  attributes: { name: string; value: string }[];
  label: string;
}
// Shared deterministic preview; the server always repeats validation and generation.
export function variantMatrix(input: VariantDimension[]): {
  dimensions: VariantDimension[];
  choices: VariantChoice[];
} {
  const clean = (s: string) => s.normalize('NFKC').trim();
  const unique = (a: string[]) =>
    new Set(a.map((s) => s.toLowerCase())).size === a.length;
  if (!Array.isArray(input) || input.length < 1 || input.length > 3)
    throw new Error('اختر من بُعد واحد إلى ثلاثة أبعاد');
  const dimensions = input.map((d) => {
    const name = clean(d.name),
      values = d.values.map(clean);
    if (
      !name ||
      name.length > 30 ||
      /[\p{Cc}\p{Cf}]/u.test(name) ||
      values.length < 1 ||
      values.length > 8 ||
      !unique(values) ||
      values.some((s) => !s || s.length > 30 || /[\p{Cc}\p{Cf}]/u.test(s))
    )
      throw new Error(
        'أسماء الأبعاد والقيم فريدة ومن 1 إلى 30 حرفاً؛ حتى ثماني قيم للبُعد',
      );
    return { name, values };
  });
  if (!unique(dimensions.map((d) => d.name)))
    throw new Error('اسم البُعد مكرر');
  if (dimensions.reduce((n, d) => n * d.values.length, 1) > 64)
    throw new Error('الحد الأقصى 64 تركيبة؛ قلل القيم قبل التوليد');
  let choices: VariantChoice[] = [{ indexes: [], attributes: [], label: '' }];
  for (const dimension of dimensions)
    choices = choices.flatMap((choice) =>
      dimension.values.map((value, i) => {
        const attributes = [
          ...choice.attributes,
          { name: dimension.name, value },
        ];
        return {
          indexes: [...choice.indexes, i + 1],
          attributes,
          label: attributes.map((a) => `${a.name}: ${a.value}`).join(' · '),
        };
      }),
    );
  if (choices.some((c) => c.label.length > 100))
    throw new Error('وصف التركيبة أطول من 100 حرف؛ اختصر أسماء الأبعاد والقيم');
  return { dimensions, choices };
}
