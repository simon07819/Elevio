-- Fallback RLS pour Annuler et recommencer depuis la page passager.
-- Le chemin principal reste cancel_passenger_request() (security definer, verifie le QR).
-- Cette policy permet le fallback direct uniquement vers status='cancelled'.

drop policy if exists "public cancel passenger requests" on requests;

create policy "public cancel passenger requests" on requests
for update using (status in ('pending', 'assigned', 'arriving'))
with check (status = 'cancelled');

notify pgrst, 'reload schema';
