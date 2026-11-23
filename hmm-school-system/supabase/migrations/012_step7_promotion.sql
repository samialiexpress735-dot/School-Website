-- Step 7: year-end promotion.
-- One function applies the director's decisions for a whole group of students, all or nothing:
--   promote  -> a NEW enrollment in the next year, next grade, no section yet (placed later on the allocation board)
--   repeat   -> a NEW enrollment in the next year, same grade and stream, status 'repeater'
--   graduate -> Grade 12 only: the enrollment and the student are marked graduated, no new enrollment
-- Earlier enrollments are never edited, except that a Grade 12 enrollment is marked 'graduated'.
-- Run once, after 001-011.

create or replace function public.apply_promotions(p_from_year uuid, p_to_year uuid, p_items jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  it jsonb; e record; g_no smallint; next_grade uuid; st uuid; st_code text;
  dec promotion_decision; n_promote int := 0; n_repeat int := 0; n_grad int := 0;
  y_from record; y_to record;
begin
  if not public.has_role(array['system_admin', 'director', 'vice_director']::app_role[]) then
    raise exception 'Not allowed';
  end if;
  select * into y_from from public.academic_years where id = p_from_year;
  select * into y_to from public.academic_years where id = p_to_year;
  if y_from.id is null or y_to.id is null then raise exception 'Choose both academic years'; end if;
  if y_to.year_ec <= y_from.year_ec then raise exception 'The new year must come after the old year'; end if;
  if y_to.is_closed then raise exception 'The new academic year is closed'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nothing to save';
  end if;

  for it in select * from jsonb_array_elements(p_items) loop
    dec := (it->>'decision')::promotion_decision;
    if dec = 'withdraw' then raise exception 'Withdrawal is not a year-end decision here'; end if;

    select * into e from public.enrollments where id = (it->>'enrollment_id')::uuid;
    if e.id is null or e.academic_year_id <> p_from_year then
      raise exception 'An enrollment does not belong to the old academic year';
    end if;
    if e.status in ('withdrawn', 'graduated') then
      raise exception 'A withdrawn or graduated student cannot be promoted';
    end if;
    if exists (select 1 from public.promotions where enrollment_id = e.id) then
      raise exception 'A decision was already saved for one of the students';
    end if;
    select number into g_no from public.grades where id = e.grade_id;

    if dec = 'graduate' then
      if g_no <> 12 then raise exception 'Only Grade 12 students can graduate'; end if;
      update public.enrollments set status = 'graduated' where id = e.id;
      update public.students set status = 'graduated' where id = e.student_id;
      n_grad := n_grad + 1;
    else
      if exists (select 1 from public.enrollments where student_id = e.student_id and academic_year_id = p_to_year) then
        raise exception 'A student already has an enrollment in the new year';
      end if;
      if dec = 'promote' then
        if g_no >= 12 then raise exception 'A Grade 12 student cannot be promoted, only graduate or repeat'; end if;
        select id into next_grade from public.grades where number = g_no + 1;
        if g_no + 1 <= 10 then
          st := null;
        else
          st := coalesce(nullif(it->>'stream_id', '')::uuid, e.stream_id);
          if st is not null then select code into st_code from public.streams where id = st; end if;
          if st is null or st_code = 'general' then
            raise exception 'Choose a Natural or Social Science stream for every student who enters Grade 11';
          end if;
        end if;
        insert into public.enrollments (student_id, academic_year_id, grade_id, section_id, stream_id, status)
        values (e.student_id, p_to_year, next_grade, null, st, 'promoted');
        n_promote := n_promote + 1;
      else -- repeat: same grade and stream
        insert into public.enrollments (student_id, academic_year_id, grade_id, section_id, stream_id, status)
        values (e.student_id, p_to_year, e.grade_id, null, e.stream_id, 'repeater');
        n_repeat := n_repeat + 1;
      end if;
    end if;

    insert into public.promotions (enrollment_id, decision, to_academic_year_id, decided_by, note)
    values (e.id, dec, case when dec = 'graduate' then null else p_to_year end, auth.uid(), nullif(trim(coalesce(it->>'note', '')), ''));
  end loop;

  return jsonb_build_object('promoted', n_promote, 'repeated', n_repeat, 'graduated', n_grad);
end $$;

revoke all on function public.apply_promotions(uuid, uuid, jsonb) from public, anon;
grant execute on function public.apply_promotions(uuid, uuid, jsonb) to authenticated;
