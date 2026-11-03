import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common'
import { createClient } from '@supabase/supabase-js'
import type { User as SupabaseUser } from '@supabase/supabase-js'

/**
 * The one call that leaves the machine to validate a token: Supabase Auth
 * answers who the bearer is. Built with the service role key so that any
 * user's token can be checked; that key never reaches a browser.
 */
@Injectable()
export class SupabaseService {
  private readonly supabase: ReturnType<typeof createClient>

  constructor() {
    const supabaseUrl = process.env.SUPABASE_URL
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new InternalServerErrorException(
        'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined'
      )
    }

    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  }

  async getUser(token: string): Promise<SupabaseUser> {
    const {
      data: { user },
      error,
    } = await this.supabase.auth.getUser(token)

    if (error || !user) {
      throw new UnauthorizedException('Jeton invalide ou expiré')
    }

    return user
  }
}
