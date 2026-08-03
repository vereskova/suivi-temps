-- A fourth employee status for people who are neither on_leave nor
-- terminated but have effectively disappeared — stopped showing up with no
-- word, not covered by any formal procedure yet (which the Calculateur de
-- rupture would only apply once RH decides how to formally end the
-- contract). Lets RH flag "we don't actually know where this person is"
-- without having to prematurely pick "terminated" or "on_leave".
alter type employee_status add value if not exists 'unclear';
