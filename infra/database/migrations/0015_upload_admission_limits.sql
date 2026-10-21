-- Keep a full 60-second admission window; a UTC minute boundary must not reset it.
CREATE TABLE media_upload_limits (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  window_started_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL CHECK(attempts BETWEEN 1 AND 6)
);
