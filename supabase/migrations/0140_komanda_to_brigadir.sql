-- Бригадирские ящики komanda_1 … komanda_10 (рабочие почты бригад) -> роль « Бригадир » (кабинет /brigadir).
-- Команда определяется привязанным сотрудником (user_roles.employee_id), он уже стоит у всех десяти.
-- Откат: update user_roles set role = 'chef' where role = 'brigadir' and auth_user_id in (select id from auth.users where email ilike 'komanda%');
update user_roles
   set role = 'brigadir'
 where role = 'chef'
   and auth_user_id in (select id from auth.users where email ilike 'komanda%');
