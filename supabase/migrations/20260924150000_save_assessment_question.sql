-- T-054: atomic save of one assessment question with its options and answer key.
-- security INVOKER on purpose: every statement runs under the caller's RLS, so only the owning
-- instructor of an editable version can change anything (can_edit_version), exactly as with
-- direct table writes - the function only adds atomicity (one transaction).
create function public.save_assessment_question(
  p_assessment_id uuid,
  p_question_id uuid,          -- null = create
  p_type text,
  p_prompt text,
  p_points int,
  p_options jsonb,             -- [{"label": "...", "correct": true|false}, ...]
  p_accepted text[],           -- short answers accepted (case-insensitive)
  p_explanation text
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
  v_pos int;
  v_correct uuid[] := '{}';
  v_opt jsonb;
  v_opt_id uuid;
  v_i int := 0;
begin
  if p_question_id is null then
    select coalesce(max(position) + 1, 0) into v_pos
      from public.assessment_questions where assessment_id = p_assessment_id;
    insert into public.assessment_questions (assessment_id, type, prompt, points, position)
    values (p_assessment_id, p_type, p_prompt, p_points, v_pos)
    returning id into v_id;
  else
    update public.assessment_questions
       set type = p_type, prompt = p_prompt, points = p_points
     where id = p_question_id and assessment_id = p_assessment_id
     returning id into v_id;
    if v_id is null then
      raise exception 'question not found or not editable' using errcode = '42501';
    end if;
    delete from public.assessment_options where question_id = v_id;
  end if;

  for v_opt in select * from jsonb_array_elements(coalesce(p_options, '[]'::jsonb)) loop
    insert into public.assessment_options (question_id, label, position)
    values (v_id, v_opt ->> 'label', v_i)
    returning id into v_opt_id;
    if coalesce((v_opt ->> 'correct')::boolean, false) then
      v_correct := v_correct || v_opt_id;
    end if;
    v_i := v_i + 1;
  end loop;

  insert into public.assessment_answer_keys (question_id, correct_option_ids, accepted_answers, explanation)
  values (v_id, v_correct, coalesce(p_accepted, '{}'), coalesce(p_explanation, ''))
  on conflict (question_id) do update
    set correct_option_ids = excluded.correct_option_ids,
        accepted_answers = excluded.accepted_answers,
        explanation = excluded.explanation;

  return v_id;
end;
$$;

revoke execute on function public.save_assessment_question(uuid, uuid, text, text, int, jsonb, text[], text) from public, anon;
grant execute on function public.save_assessment_question(uuid, uuid, text, text, int, jsonb, text[], text) to authenticated;
