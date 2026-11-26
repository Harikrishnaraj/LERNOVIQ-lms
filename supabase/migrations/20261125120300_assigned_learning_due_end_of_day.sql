-- Report audit C10, C40: an assigned-learning due date is picked as a calendar day, but was stored
-- as 00:00 UTC at the START of that day, so learners showed as overdue for the whole due day.
-- The app now stores 23:59:59.999 UTC of the chosen day (validateAssignedLearningInput) and shows
-- the date in UTC, so overdue (`due_at < now()` in list_org_assigned_learning and
-- my_assigned_learning) starts only once the day is over. This moves the existing date-picked
-- values (exactly midnight UTC) to the end of their day.
update public.assigned_learning
   set due_at = due_at + interval '1 day' - interval '1 millisecond'
 where due_at is not null
   and due_at = date_trunc('day', due_at at time zone 'utc') at time zone 'utc';
