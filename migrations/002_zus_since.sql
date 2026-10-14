-- Дата начала льготной схемы ZUS (ulga na start или preferencyjny),
-- чтобы знать, когда взносы вырастут.
ALTER TABLE onboarding_answers ADD COLUMN zus_since DATE;
