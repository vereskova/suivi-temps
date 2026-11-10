-- Rôle « контролёр » : accès uniquement à l'écran /controle (saisie des штрафы après contrôle chantier).
-- À exécuter SEUL (un ALTER TYPE ... ADD VALUE ne peut pas être utilisé dans la même transaction).
alter type app_role add value if not exists 'controleur';
