-- Nom affiche passager (QR) pendant que la tablette est activee — rempli depuis le profil a l'activation.
alter table elevators add column if not exists operator_display_name text;

-- Si l API renvoie encore « Could not find ... in the schema cache », forcer PostgREST a recharger :
notify pgrst, 'reload schema';
