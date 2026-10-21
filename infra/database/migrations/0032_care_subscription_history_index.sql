-- Scope pause/resume history lookups to the subscription, including resume cutoff searches.
CREATE INDEX care_subscription_events_history ON care_subscription_events(subscription_id,action,occurred_at);
