-- Rôle « бригадир » : кабинет бригадира /brigadir (объекты своей команды и контрандю, отметки, премии).
-- Привязка к сотруднику (user_roles.employee_id) задаёт команду. Данные отдаёт только сервер (service role).
-- À exécuter SEUL (un ALTER TYPE ... ADD VALUE ne peut pas être utilisé dans la même transaction).
alter type app_role add value if not exists 'brigadir';
