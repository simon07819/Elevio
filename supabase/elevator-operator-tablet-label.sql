-- Libellé d'appareil optionnel saisi à l'activation tablette (affichage admin / opérateur).
alter table elevators add column if not exists operator_tablet_label text;
