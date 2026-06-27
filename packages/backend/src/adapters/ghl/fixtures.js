// Realistic sample data approximating HighLevel Voice AI agents + call transcripts.
// Used by the mock adapter and the seed script. Designed so analysis produces a MIX of
// passing and failing calls (good for a demo dashboard).

export const LOCATION_ID = "loc_demo_001";

export const AGENTS = [
  {
    id: "agent_booking_01",
    locationId: LOCATION_ID,
    name: "Appointment Setter — Dental",
    goal:
      "Qualify inbound dental leads, confirm insurance, and book an appointment. " +
      "Must always offer at least two time slots and never give medical advice.",
  },
  {
    id: "agent_support_02",
    locationId: LOCATION_ID,
    name: "Support Triage — SaaS",
    goal:
      "Identify the customer's issue, attempt a known fix, and escalate billing or outage " +
      "issues to a human. Must confirm account email and never promise refunds.",
  },
];

// KPI definitions seeded per agent (the 'observability parameters').
export const KPIS = [
  // Dental booking agent
  { agentId: "agent_booking_01", key: "offered_two_slots", label: "Offered ≥2 time slots", type: "keyword_presence", config: { keywords: ["or", "another time", "morning", "afternoon", "Tuesday", "Thursday"], weight: 0.8 }, severity: "high" },
  { agentId: "agent_booking_01", key: "confirmed_insurance", label: "Confirmed insurance", type: "keyword_presence", config: { keywords: ["insurance", "provider", "covered"], weight: 0.6 }, severity: "medium" },
  { agentId: "agent_booking_01", key: "no_medical_advice", label: "Avoided medical advice", type: "keyword_absence", config: { keywords: ["you should take", "diagnos", "prescri", "that means you have"], weight: 1 }, severity: "critical" },
  { agentId: "agent_booking_01", key: "booked_appointment", label: "Booked appointment", type: "llm_rubric", config: { rubric: "Did the agent successfully book a specific appointment date/time that the customer agreed to?", weight: 1 }, severity: "high" },

  // Support triage agent
  { agentId: "agent_support_02", key: "confirmed_email", label: "Confirmed account email", type: "keyword_presence", config: { keywords: ["email", "@"], weight: 0.6 }, severity: "medium" },
  { agentId: "agent_support_02", key: "no_refund_promise", label: "No refund promises", type: "keyword_absence", config: { keywords: ["full refund", "we will refund", "money back guaranteed"], weight: 1 }, severity: "critical" },
  { agentId: "agent_support_02", key: "escalated_when_needed", label: "Escalated billing/outage", type: "llm_rubric", config: { rubric: "If the issue was billing or an outage, did the agent escalate to a human?", weight: 0.9 }, severity: "high" },
];

const t = (speaker, text, startSec) => ({ speaker, text, startSec });

export const CALLS = [
  // ✅ Good booking call
  {
    provider: "ghl", locationId: LOCATION_ID, agentId: "agent_booking_01", callId: "call_1001",
    startedAt: "2026-06-20T15:00:00.000Z", durationSec: 184, direction: "inbound", outcome: "booked",
    transcript: { turns: [
      t("agent", "Thanks for calling Bright Smile Dental, this is Ava. How can I help?", 0),
      t("customer", "Hi, I'd like to book a cleaning.", 6),
      t("agent", "Happy to help! Do you have dental insurance we should note on file?", 10),
      t("customer", "Yes, Delta Dental.", 16),
      t("agent", "Great, Delta is covered. I have Tuesday at 2pm or Thursday at 10am — which works?", 20),
      t("customer", "Thursday at 10am is perfect.", 30),
      t("agent", "Booked you for Thursday 10am. You'll get a text confirmation. Anything else?", 34),
      t("customer", "Nope, thank you!", 41),
    ] },
    metadata: {},
  },
  // ❌ Booking call: no second slot, gave medical advice (critical)
  {
    provider: "ghl", locationId: LOCATION_ID, agentId: "agent_booking_01", callId: "call_1002",
    startedAt: "2026-06-21T16:10:00.000Z", durationSec: 150, direction: "inbound", outcome: "no_booking",
    transcript: { turns: [
      t("agent", "Bright Smile Dental, this is Ava.", 0),
      t("customer", "My tooth really hurts, what should I do?", 5),
      t("agent", "It sounds like an infection — you should take antibiotics for that.", 9),
      t("customer", "Oh okay. Can I come in?", 15),
      t("agent", "We have Tuesday at 2pm.", 19),
      t("customer", "I can't do Tuesdays.", 23),
      t("agent", "Okay, call back later then.", 26),
    ] },
    metadata: {},
  },
  // ⚠️ Booking call: booked but never confirmed insurance
  {
    provider: "ghl", locationId: LOCATION_ID, agentId: "agent_booking_01", callId: "call_1003",
    startedAt: "2026-06-22T14:05:00.000Z", durationSec: 120, direction: "inbound", outcome: "booked",
    transcript: { turns: [
      t("agent", "Bright Smile Dental, this is Ava. How can I help?", 0),
      t("customer", "I need a check-up.", 5),
      t("agent", "Sure! I have Monday morning or Wednesday afternoon — which is better?", 9),
      t("customer", "Wednesday afternoon.", 16),
      t("agent", "Done, Wednesday 3pm. See you then!", 19),
    ] },
    metadata: {},
  },
  // ✅ Good support call: escalated billing
  {
    provider: "ghl", locationId: LOCATION_ID, agentId: "agent_support_02", callId: "call_2001",
    startedAt: "2026-06-22T18:00:00.000Z", durationSec: 95, direction: "inbound", outcome: "escalated",
    transcript: { turns: [
      t("agent", "Support line, this is Max. What's going on?", 0),
      t("customer", "I was double charged this month.", 5),
      t("agent", "Sorry about that. Can you confirm the email on your account?", 9),
      t("customer", "jane@acme.com", 14),
      t("agent", "Thanks Jane. Billing issues go to our specialist — I'm escalating this to a human now.", 18),
      t("customer", "Great, thanks.", 26),
    ] },
    metadata: {},
  },
  // ❌ Support call: promised refund (critical), didn't confirm email, no escalation
  {
    provider: "ghl", locationId: LOCATION_ID, agentId: "agent_support_02", callId: "call_2002",
    startedAt: "2026-06-23T11:30:00.000Z", durationSec: 70, direction: "inbound", outcome: "resolved",
    transcript: { turns: [
      t("agent", "Support, this is Max.", 0),
      t("customer", "Your app was down and I lost work, I want my money back.", 4),
      t("agent", "Absolutely, we will refund you in full right away.", 10),
      t("customer", "Okay good.", 15),
      t("agent", "All set, have a great day!", 17),
    ] },
    metadata: {},
  },
];
