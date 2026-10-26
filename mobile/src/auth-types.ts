import type { Session, User } from "@supabase/supabase-js";

export type GoogleLoginResult = { user: User; session: Session };
