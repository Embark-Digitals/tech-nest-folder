-- 1. Team & roles management -------------------------------------------------
CREATE POLICY "Admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "Staff can view profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

-- 2. CRM notes ----------------------------------------------------------------
CREATE TABLE public.crm_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_notes TO authenticated;
GRANT ALL ON public.crm_notes TO service_role;
ALTER TABLE public.crm_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view notes" ON public.crm_notes
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff create notes" ON public.crm_notes
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Staff edit own notes" ON public.crm_notes
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()) AND created_by = auth.uid())
  WITH CHECK (public.is_staff(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Admins delete notes" ON public.crm_notes
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()) OR created_by = auth.uid());

CREATE TRIGGER crm_notes_updated_at BEFORE UPDATE ON public.crm_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX crm_notes_customer_idx ON public.crm_notes (customer_id, created_at DESC);

-- 3. CRM tasks ----------------------------------------------------------------
CREATE TYPE public.crm_task_status AS ENUM ('open', 'in_progress', 'done', 'cancelled');

CREATE TABLE public.crm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  title text NOT NULL,
  details text,
  due_date date,
  status public.crm_task_status NOT NULL DEFAULT 'open',
  assigned_to uuid,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_tasks TO authenticated;
GRANT ALL ON public.crm_tasks TO service_role;
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff view tasks" ON public.crm_tasks
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY "Staff create tasks" ON public.crm_tasks
  FOR INSERT TO authenticated WITH CHECK (public.is_staff(auth.uid()) AND created_by = auth.uid());
CREATE POLICY "Staff update tasks" ON public.crm_tasks
  FOR UPDATE TO authenticated USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY "Admins delete tasks" ON public.crm_tasks
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()) OR created_by = auth.uid());

CREATE TRIGGER crm_tasks_updated_at BEFORE UPDATE ON public.crm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX crm_tasks_assigned_idx ON public.crm_tasks (assigned_to, status, due_date);
CREATE INDEX crm_tasks_customer_idx ON public.crm_tasks (customer_id);

-- 4. Lead pipeline on orders ---------------------------------------------------
CREATE TYPE public.pipeline_stage AS ENUM ('new', 'contacted', 'quoted', 'negotiating', 'won', 'lost');

ALTER TABLE public.orders
  ADD COLUMN assigned_to uuid,
  ADD COLUMN pipeline_stage public.pipeline_stage NOT NULL DEFAULT 'new';

CREATE INDEX orders_pipeline_idx ON public.orders (pipeline_stage, assigned_to);
