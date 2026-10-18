-- =====================================================================
-- Carga del equipo. Ejecutar DESPUÉS de migrations/0001_inicial.sql.
-- Completá los emails que faltan (el que cada uno usa para entrar).
-- Solo los emails de esta tabla pueden ingresar a la app.
-- =====================================================================

insert into public.equipo (nombre, alias_planilla, email, rol) values
  ('Teo',     'Teo',  'teohuber998@gmail.com',       'admin'),
  ('Agui',    'Agui', 'EMAIL_DE_AGUI@ejemplo.com',   'equipo'),
  ('Agustín', 'Tete', 'EMAIL_DE_TETE@ejemplo.com',   'equipo'),
  ('Fede',    'Fede', 'EMAIL_DE_FEDE@ejemplo.com',   'equipo')
on conflict (email) do nothing;

-- Para cambiar un email más adelante:
-- update public.equipo set email = 'nuevo@email.com' where nombre = 'Fede';
