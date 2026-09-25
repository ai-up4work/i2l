// lib/supabase/types.ts
//
// Hand-written from the schema dump in the "wishdrop schema" reference
// (public.* tables only — auth.users is Supabase-managed and not
// redeclared here). This is NOT a substitute for the generated version —
// USER-DEFINED enum columns are typed as `string` below because the dump
// doesn't include the enum's allowed values, and RLS/relationship metadata
// generated types normally carry isn't present either.
//
// Regenerate for real as soon as you can:
//   npx supabase login
//   npx supabase gen types typescript --project-id <your-project-ref> > lib/supabase/types.ts
//
// Until then, this file at least gives every `.from('table_name')` call
// real column names and Row/Insert/Update shapes instead of `any`, so a
// typo like `.select('naem')` or `.update({ pric: 10 })` is caught at
// compile time.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          full_name: string
          email: string
          phone: string | null
          phone_verified: boolean
          pending_phone: string | null
          phone_otp_code_hash: string | null
          phone_otp_expires_at: string | null
          phone_otp_attempts: number
          avatar_url: string | null
          chat_handle: string | null
          created_at: string
          updated_at: string
          referral_code: string | null
          /** Offers/promotional push opt-in — see data/wishdrop-push-notifications.sql. */
          push_offers: boolean
        }
        Insert: {
          id: string
          full_name: string
          email: string
          phone?: string | null
          phone_verified?: boolean
          pending_phone?: string | null
          phone_otp_code_hash?: string | null
          phone_otp_expires_at?: string | null
          phone_otp_attempts?: number
          avatar_url?: string | null
          chat_handle?: string | null
          created_at?: string
          updated_at?: string
          referral_code?: string | null
          push_offers?: boolean
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
        Relationships: []
      }
      addresses: {
        Row: {
          id: string
          user_id: string
          label: string | null
          recipient_name: string
          phone: string
          address_line1: string
          address_line2: string | null
          city: string
          postal_code: string | null
          country: string
          is_default: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          label?: string | null
          recipient_name: string
          phone: string
          address_line1: string
          address_line2?: string | null
          city: string
          postal_code?: string | null
          country?: string
          is_default?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['addresses']['Insert']>
        Relationships: []
      }
      sellers: {
        Row: {
          id: string
          platform_slug: string
          name: string
          type: string
          store_kind: string
          status: string
          contact_email: string | null
          logo_url: string | null
          country: string | null
          flag_emoji: string | null
          description: string | null
          categories: string[]
          outbound_url: string | null
          provider_type: string | null
          provider_config: Json | null
          last_sync: string | null
          feed_healthy: boolean | null
          last_edit: string | null
          created_at: string
          contact_name: string | null
          contact_phone: string | null
          notes: string | null
          owner_user_id: string | null
          default_margin_percent: number
        }
        Insert: {
          id?: string
          platform_slug: string
          name: string
          type: string
          store_kind?: string
          status?: string
          contact_email?: string | null
          logo_url?: string | null
          country?: string | null
          flag_emoji?: string | null
          description?: string | null
          categories?: string[]
          outbound_url?: string | null
          provider_type?: string | null
          provider_config?: Json | null
          last_sync?: string | null
          feed_healthy?: boolean | null
          last_edit?: string | null
          created_at?: string
          contact_name?: string | null
          contact_phone?: string | null
          notes?: string | null
          owner_user_id?: string | null
          default_margin_percent?: number
        }
        Update: Partial<Database['public']['Tables']['sellers']['Insert']>
        Relationships: []
      }
      products: {
        Row: {
          id: string
          seller_id: string
          handle: string
          name: string
          description: string | null
          full_description: string | null
          category: string | null
          condition: string | null
          tags: string[]
          gender: 'men' | 'women' | 'unisex' | null
          sku: string | null
          cost_price: number | null
          margin_percent: number | null
          price: number
          compare_at_price: number | null
          currency: string
          weight_kg: number | null
          images: string[]
          stock_count: number | null
          average_rating: number | null
          review_count: number
          active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          seller_id: string
          handle: string
          name: string
          description?: string | null
          full_description?: string | null
          category?: string | null
          condition?: string | null
          tags?: string[]
          gender?: 'men' | 'women' | 'unisex' | null
          sku?: string | null
          cost_price?: number | null
          margin_percent?: number | null
          price: number
          compare_at_price?: number | null
          currency?: string
          weight_kg?: number | null
          images?: string[]
          stock_count?: number | null
          average_rating?: number | null
          review_count?: number
          active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['products']['Insert']>
        Relationships: []
      }
      product_variants: {
        Row: {
          id: string
          product_id: string
          label: string
          sku: string | null
          options: Json
          price: number | null
          compare_at_price: number | null
          stock: number
          image_url: string | null
          available: boolean
        }
        Insert: {
          id?: string
          product_id: string
          label: string
          sku?: string | null
          options?: Json
          price?: number | null
          compare_at_price?: number | null
          stock?: number
          image_url?: string | null
          available?: boolean
        }
        Update: Partial<Database['public']['Tables']['product_variants']['Insert']>
        Relationships: []
      }
      product_snapshots: {
        Row: {
          id: string
          source: string
          product_id: string | null
          variant_id: string | null
          url: string | null
          site: string | null
          title: string
          image_url: string | null
          currency: string | null
          price: number | null
          captured_at: string
        }
        Insert: {
          id?: string
          source: string
          product_id?: string | null
          variant_id?: string | null
          url?: string | null
          site?: string | null
          title: string
          image_url?: string | null
          currency?: string | null
          price?: number | null
          captured_at?: string
        }
        Update: Partial<Database['public']['Tables']['product_snapshots']['Insert']>
        Relationships: []
      }
      collections: {
        Row: {
          id: string
          slug: string
          name: string
          description: string | null
          filter_type: string
          rule: Json | null
          active: boolean
          position: number
          created_at: string
        }
        Insert: {
          id?: string
          slug: string
          name: string
          description?: string | null
          filter_type?: string
          rule?: Json | null
          active?: boolean
          position?: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['collections']['Insert']>
        Relationships: []
      }
      collection_items: {
        Row: {
          id: string
          collection_id: string
          product_id: string
          manually_added: boolean
          manually_removed: boolean
          position: number
        }
        Insert: {
          id?: string
          collection_id: string
          product_id: string
          manually_added?: boolean
          manually_removed?: boolean
          position?: number
        }
        Update: Partial<Database['public']['Tables']['collection_items']['Insert']>
        Relationships: []
      }
      discounts: {
        Row: {
          id: string
          code: string
          title: string | null
          type: string
          value: number
          scope: string
          scope_ids: string[] | null
          starts_at: string
          ends_at: string
          usage_limit: number | null
          usage_count: number
          status: string
          created_at: string
        }
        Insert: {
          id?: string
          code: string
          title?: string | null
          type: string
          value: number
          scope?: string
          scope_ids?: string[] | null
          starts_at: string
          ends_at: string
          usage_limit?: number | null
          usage_count?: number
          status?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['discounts']['Insert']>
        Relationships: []
      }
      user_promo_codes: {
        Row: {
          id: string
          user_id: string
          discount_id: string
          status: string
          used_on_order_id: string | null
          assigned_at: string
          used_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          discount_id: string
          status?: string
          used_on_order_id?: string | null
          assigned_at?: string
          used_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['user_promo_codes']['Insert']>
        Relationships: []
      }
      discount_redemptions: {
        Row: {
          id: string
          discount_id: string
          user_id: string
          order_id: string | null
          amount_applied: number
          redeemed_at: string
        }
        Insert: {
          id?: string
          discount_id: string
          user_id: string
          order_id?: string | null
          amount_applied: number
          redeemed_at?: string
        }
        Update: Partial<Database['public']['Tables']['discount_redemptions']['Insert']>
        Relationships: []
      }
      wishlist_items: {
        Row: {
          id: string
          user_id: string
          product_snapshot_id: string
          added_at: string
        }
        Insert: {
          id?: string
          user_id: string
          product_snapshot_id: string
          added_at?: string
        }
        Update: Partial<Database['public']['Tables']['wishlist_items']['Insert']>
        Relationships: []
      }
      boards: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          visibility: string
          share_token: string | null
          position: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          visibility?: string
          share_token?: string | null
          position?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['boards']['Insert']>
        Relationships: []
      }
      board_items: {
        Row: {
          id: string
          board_id: string
          product_snapshot_id: string
          variant: Json | null
          quantity: number
          price_at_save: number | null
          position: number
          added_at: string
        }
        Insert: {
          id?: string
          board_id: string
          product_snapshot_id: string
          variant?: Json | null
          quantity?: number
          price_at_save?: number | null
          position?: number
          added_at?: string
        }
        Update: Partial<Database['public']['Tables']['board_items']['Insert']>
        Relationships: []
      }
      cart_items: {
        Row: {
          id: string
          user_id: string
          product_snapshot_id: string
          quantity: number
          selected_options: Json | null
          added_at: string
          source: string | null
        }
        Insert: {
          id?: string
          user_id: string
          product_snapshot_id: string
          quantity?: number
          selected_options?: Json | null
          added_at?: string
          source?: string | null
        }
        Update: Partial<Database['public']['Tables']['cart_items']['Insert']>
        Relationships: []
      }
      chat_threads: {
        Row: {
          id: string
          user_id: string
          request_id: string | null
          order_id: string | null
          // Rollup of the most recent TAGGED message in this thread —
          // added by data/wishdrop-chat-threads-context-rollup.sql.
          // Kept current by sendChatMessage() in lib/supabase/chat.ts.
          // Distinct from request_id/order_id above, which are only
          // ever set at thread-CREATION time and are effectively always
          // null now that a customer's thread is reused for their whole
          // lifetime rather than created per request/order.
          last_request_id: string | null
          last_order_id: string | null
          last_activity: string
          unread: boolean
        }
        Insert: {
          id?: string
          user_id: string
          request_id?: string | null
          order_id?: string | null
          last_request_id?: string | null
          last_order_id?: string | null
          last_activity?: string
          unread?: boolean
        }
        Update: Partial<Database['public']['Tables']['chat_threads']['Insert']>
        Relationships: []
      }
      requests: {
        Row: {
          id: string
          user_id: string
          display_id: string
          link: string
          note: string | null
          item_name: string | null
          screenshot_url: string | null
          source_domain: string
          status: string
          quote: number | null
          chat_thread_id: string
          assigned_staff_id: string | null
          submitted_at: string
          payment_amount: number | null
          payment_method: string | null
          payment_reference: string | null
          payment_confirmed_at: string | null
          payment_confirmed_by: string | null
          needs_variant_confirmation: boolean
          confirmed_variant: string | null
          product_image_url: string | null
          seller_name: string | null
          quantity: number
          variant_options: Json | null
          // Kept current by sendChatMessage() in lib/supabase/chat.ts —
          // see data/wishdrop-orders-requests-unreplied-flag.sql.
          has_unreplied_message: boolean
        }
        Insert: {
          id?: string
          user_id: string
          display_id?: string
          link: string
          note?: string | null
          item_name?: string | null
          screenshot_url?: string | null
          source_domain: string
          status?: string
          quote?: number | null
          chat_thread_id: string
          assigned_staff_id?: string | null
          submitted_at?: string
          payment_amount?: number | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          needs_variant_confirmation?: boolean
          confirmed_variant?: string | null
          product_image_url?: string | null
          seller_name?: string | null
          quantity?: number
          variant_options?: Json | null
          has_unreplied_message?: boolean
        }
        Update: Partial<Database['public']['Tables']['requests']['Insert']>
        Relationships: []
      }
      request_quote_history: {
        Row: {
          id: string
          request_id: string
          amount: number
          staff_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          request_id: string
          amount: number
          staff_id?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['request_quote_history']['Insert']>
        Relationships: []
      }
      chat_messages: {
        Row: {
          id: string
          thread_id: string
          sender: string
          sender_name: string
          text: string | null
          attachment_url: string | null
          request_id: string | null
          order_id: string | null
          sent_via_whatsapp: boolean
          // See data/wishdrop-chat-messages-channel.sql — 'whatsapp' for
          // a message that arrived via, or was relayed out through, the
          // Cloud API webhook; null for the normal in-app case. Distinct
          // from sent_via_whatsapp above, which specifically means
          // "staff manually used the wa.me deep-link button."
          channel: string | null
          created_at: string
        }
        Insert: {
          id?: string
          thread_id: string
          sender: string
          sender_name: string
          text?: string | null
          attachment_url?: string | null
          request_id?: string | null
          order_id?: string | null
          sent_via_whatsapp?: boolean
          channel?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['chat_messages']['Insert']>
        Relationships: []
      }
      orders: {
        Row: {
          id: string
          display_id: string
          user_id: string
          channel: 1 | 2 | 3
          stage: string
          currency: string
          total_value: number
          delayed: boolean
          export_hold: boolean
          site_id: string | null
          request_id: string | null
          chat_thread_id: string | null
          recipient_address_id: string | null
          carrier: string | null
          tracking_number: string | null
          estimated_delivery: string | null
          delivered_confirmed_by: 'warehouse' | 'customer' | null
          created_at: string
          stage_entered_at: string
          // Kept current by sendChatMessage() in lib/supabase/chat.ts —
          // see data/wishdrop-orders-requests-unreplied-flag.sql.
          has_unreplied_message: boolean
        }
        Insert: {
          id?: string
          // Optional now that orders.display_id has a real DB default
          // (a Postgres sequence — see
          // data/wishdrop-order-display-id-sequence.sql). Marking this
          // required was accurate against the old schema (no default
          // existed, so every insert had to supply one), but is now
          // stale — both createOrderWithRetry (DashboardContext.tsx)
          // and confirmRequestReal (requests-admin.ts) intentionally
          // omit it and let the database assign it.
          display_id?: string
          user_id: string
          channel: 1 | 2 | 3
          stage?: string
          currency?: string
          total_value?: number
          delayed?: boolean
          export_hold?: boolean
          site_id?: string | null
          request_id?: string | null
          chat_thread_id?: string | null
          recipient_address_id?: string | null
          carrier?: string | null
          tracking_number?: string | null
          estimated_delivery?: string | null
          delivered_confirmed_by?: 'warehouse' | 'customer' | null
          created_at?: string
          stage_entered_at?: string
          has_unreplied_message?: boolean
        }
        Update: Partial<Database['public']['Tables']['orders']['Insert']>
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          product_snapshot_id: string | null
          title: string
          variant_label: string | null
          quantity: number
          unit_price: number
          seller_name: string | null
          seller_type: string | null
          store_url: string | null
          request_link: string | null
          screenshot_url: string | null
          // Real, per-item QC-passed signal — see markItemQcPassed in
          // lib/supabase/orders-admin.ts and
          // data/wishdrop-qc-per-item-pass.sql for the bug this fixes
          // (marking one item passed used to flip the whole order's
          // substage, silently marking every sibling item as passed too).
          qc_passed_at: string | null
          qc_note: string | null
          product_image_url: string | null
        }
        Insert: {
          id?: string
          order_id: string
          product_snapshot_id?: string | null
          title: string
          variant_label?: string | null
          quantity?: number
          unit_price: number
          seller_name?: string | null
          seller_type?: string | null
          store_url?: string | null
          request_link?: string | null
          screenshot_url?: string | null
          qc_passed_at?: string | null
          qc_note?: string | null
          product_image_url?: string | null
        }
        Update: Partial<Database['public']['Tables']['order_items']['Insert']>
        Relationships: []
      }
      order_stage_history: {
        Row: {
          id: string
          order_id: string
          stage: string
          by_staff_id: string | null
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          stage: string
          by_staff_id?: string | null
          note?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['order_stage_history']['Insert']>
        Relationships: []
      }
      reviews: {
        Row: {
          id: string
          product_id: string
          user_id: string
          order_item_id: string | null
          rating: number
          title: string | null
          body: string | null
          images: string[]
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          user_id: string
          order_item_id?: string | null
          rating: number
          title?: string | null
          body?: string | null
          images?: string[]
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['reviews']['Insert']>
        Relationships: []
      }
      recently_viewed: {
        Row: {
          id: string
          user_id: string
          product_snapshot_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          user_id: string
          product_snapshot_id: string
          viewed_at?: string
        }
        Update: Partial<Database['public']['Tables']['recently_viewed']['Insert']>
        Relationships: []
      }
      store_follows: {
        Row: {
          id: string
          user_id: string
          platform_slug: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          platform_slug: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['store_follows']['Insert']>
        Relationships: []
      }
      loyalty_accounts: {
        Row: {
          user_id: string
          points: number
          last_check_in_at: string | null
          claimed_order_ids: string[]
          created_at: string
          claimed_campaign_ids: string[]
        }
        Insert: {
          user_id: string
          points?: number
          last_check_in_at?: string | null
          claimed_order_ids?: string[]
          created_at?: string
          claimed_campaign_ids?: string[]
        }
        Update: Partial<Database['public']['Tables']['loyalty_accounts']['Insert']>
        Relationships: []
      }
      loyalty_transactions: {
        Row: {
          id: string
          user_id: string
          delta: number
          source: string
          source_ref: string | null
          label: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          delta: number
          source: string
          source_ref?: string | null
          label?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['loyalty_transactions']['Insert']>
        Relationships: []
      }
      loyalty_milestones_claimed: {
        Row: {
          id: string
          user_id: string
          milestone_key: string
          claimed_at: string
        }
        Insert: {
          id?: string
          user_id: string
          milestone_key: string
          claimed_at?: string
        }
        Update: Partial<Database['public']['Tables']['loyalty_milestones_claimed']['Insert']>
        Relationships: []
      }
      referrals: {
        Row: {
          id: string
          referrer_id: string
          referred_user_id: string | null
          referred_contact: string | null
          code: string
          status: string
          joined_at: string | null
          rewarded_at: string | null
          created_at: string
          reward_label: string | null
          reward_amount: number | null
        }
        Insert: {
          id?: string
          referrer_id: string
          referred_user_id?: string | null
          referred_contact?: string | null
          code: string
          status?: string
          joined_at?: string | null
          rewarded_at?: string | null
          created_at?: string
          reward_label?: string | null
          reward_amount?: number | null
        }
        Update: Partial<Database['public']['Tables']['referrals']['Insert']>
        Relationships: []
      }
      credit_wallets: {
        Row: {
          user_id: string
          balance: number
        }
        Insert: {
          user_id: string
          balance?: number
        }
        Update: Partial<Database['public']['Tables']['credit_wallets']['Insert']>
        Relationships: []
      }
      credit_transactions: {
        Row: {
          id: string
          user_id: string
          amount: number
          type: string
          label: string | null
          related_order_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          amount: number
          type: string
          label?: string | null
          related_order_id?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['credit_transactions']['Insert']>
        Relationships: []
      }
      gift_cards: {
        Row: {
          id: string
          code: string
          initial_value: number
          balance: number
          purchased_by: string | null
          recipient_email: string | null
          issued_at: string
          expires_at: string | null
          redeemed: boolean
          redeemed_by: string | null
        }
        Insert: {
          id?: string
          code: string
          initial_value: number
          balance: number
          purchased_by?: string | null
          recipient_email?: string | null
          issued_at?: string
          expires_at?: string | null
          redeemed?: boolean
          redeemed_by?: string | null
        }
        Update: Partial<Database['public']['Tables']['gift_cards']['Insert']>
        Relationships: []
      }
      community_posts: {
        Row: {
          id: string
          user_id: string
          tag: string | null
          content: string
          image_url: string | null
          likes_count: number
          comments_count: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          tag?: string | null
          content: string
          image_url?: string | null
          likes_count?: number
          comments_count?: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['community_posts']['Insert']>
        Relationships: []
      }
      community_likes: {
        Row: {
          post_id: string
          user_id: string
          created_at: string
        }
        Insert: {
          post_id: string
          user_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['community_likes']['Insert']>
        Relationships: []
      }
      community_comments: {
        Row: {
          id: string
          post_id: string
          user_id: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          post_id: string
          user_id: string
          content: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['community_comments']['Insert']>
        Relationships: []
      }
      follows: {
        Row: {
          id: string
          follower_id: string
          followed_type: string
          followed_id: string
          created_at: string
        }
        Insert: {
          id?: string
          follower_id: string
          followed_type: string
          followed_id: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['follows']['Insert']>
        Relationships: []
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          type: string
          title: string
          body: string | null
          link: string | null
          read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          title: string
          body?: string | null
          link?: string | null
          read?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['notifications']['Insert']>
        Relationships: []
      }
      // See data/wishdrop-push-notifications.sql.
      push_subscriptions: {
        Row: {
          id: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent: string | null
          created_at: string
          last_seen_at: string
          failure_count: number
        }
        Insert: {
          id?: string
          user_id: string
          endpoint: string
          p256dh: string
          auth: string
          user_agent?: string | null
          created_at?: string
          last_seen_at?: string
          failure_count?: number
        }
        Update: Partial<Database['public']['Tables']['push_subscriptions']['Insert']>
        Relationships: []
      }
      push_broadcasts: {
        Row: {
          id: string
          kind: 'announcement' | 'offer'
          title: string
          body: string
          url: string
          audience: Json
          audience_label: string
          created_by: string | null
          created_by_name: string | null
          status: 'sending' | 'sent' | 'failed'
          recipient_count: number
          device_count: number
          push_sent: number
          push_failed: number
          error: string | null
          created_at: string
          completed_at: string | null
        }
        Insert: {
          id?: string
          kind: 'announcement' | 'offer'
          title: string
          body: string
          url?: string
          audience: Json
          audience_label: string
          created_by?: string | null
          created_by_name?: string | null
          status?: 'sending' | 'sent' | 'failed'
          recipient_count?: number
          device_count?: number
          push_sent?: number
          push_failed?: number
          error?: string | null
          created_at?: string
          completed_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['push_broadcasts']['Insert']>
        Relationships: []
      }
      // See data/wishdrop-whatsapp-manual-verification.sql.
      whatsapp_verification_requests: {
        Row: {
          id: string
          user_id: string
          phone: string
          reference: string
          status: 'pending' | 'verified' | 'rejected' | 'cancelled'
          verified_phone: string | null
          reject_reason: string | null
          decided_by: string | null
          decided_by_name: string | null
          created_at: string
          decided_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          phone: string
          reference: string
          status?: 'pending' | 'verified' | 'rejected' | 'cancelled'
          verified_phone?: string | null
          reject_reason?: string | null
          decided_by?: string | null
          decided_by_name?: string | null
          created_at?: string
          decided_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['whatsapp_verification_requests']['Insert']>
        Relationships: []
      }
      sites: {
        Row: {
          id: string
          name: string
          location: string
          headcount: number
          active: boolean
          is_default: boolean
        }
        Insert: {
          id?: string
          name: string
          location: string
          headcount?: number
          active?: boolean
          is_default?: boolean
        }
        Update: Partial<Database['public']['Tables']['sites']['Insert']>
        Relationships: []
      }
      staff_accounts: {
        Row: {
          id: string
          user_id: string | null
          name: string
          email: string
          // Nullable — a self-registered ('pending') account has no
          // role until a Manager/Super Admin approves it. See
          // data/wishdrop-staff-self-registration.sql.
          role: string | null
          // What a self-registered applicant said they're applying
          // for — informational only, never the source of the actual
          // granted role.
          requested_role: string | null
          site_id: string | null
          status: string
          last_login: string | null
          // Per-account toggle prefs for /admin/settings/notifications
          // (new_request, order_delayed, chat_message, qc_flagged,
          // purchase_issue) — see data/wishdrop-staff-notification-prefs.sql.
          // Nullable/absent keys default to "on" client-side, so this
          // column only ever needs to store the OFF exceptions.
          notification_prefs: Record<string, boolean> | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          name: string
          email: string
          role?: string | null
          requested_role?: string | null
          site_id?: string | null
          status?: string
          last_login?: string | null
          notification_prefs?: Record<string, boolean> | null
        }
        Update: Partial<Database['public']['Tables']['staff_accounts']['Insert']>
        Relationships: []
      }
      order_internal_notes: {
        Row: {
          id: string
          order_id: string
          staff_id: string
          text: string
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          staff_id: string
          text: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['order_internal_notes']['Insert']>
        Relationships: []
      }
      purchases: {
        Row: {
          id: string
          order_id: string | null
          request_id: string | null
          channel: 1 | 2 | 3
          source_store: string
          amount: number
          status: string
          receipt_ref: string | null
          fail_reason: string | null
          outbound_payment: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id?: string | null
          request_id?: string | null
          channel: 1 | 2 | 3
          source_store: string
          amount: number
          status?: string
          receipt_ref?: string | null
          fail_reason?: string | null
          outbound_payment?: Json | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['purchases']['Insert']>
        Relationships: []
      }
      scrape_health: {
        Row: {
          domain: string
          fail_count: number
          success_count: number
          last_failure: string | null
          linked_seller_id: string | null
          decision: string
          ops_note: string | null
          last_success_title: string | null
          last_success_image_url: string | null
          last_success_price: string | null
          last_success_at: string | null
          last_error: string | null
        }
        Insert: {
          domain: string
          fail_count?: number
          success_count?: number
          last_failure?: string | null
          linked_seller_id?: string | null
          decision?: string
          ops_note?: string | null
          last_success_title?: string | null
          last_success_image_url?: string | null
          last_success_price?: string | null
          last_success_at?: string | null
          last_error?: string | null
        }
        Update: Partial<Database['public']['Tables']['scrape_health']['Insert']>
        Relationships: []
      }
      seller_extraction_history: {
        Row: {
          id: string
          seller_id: string
          url: string
          succeeded: boolean
          error_message: string | null
          created_at: string
        }
        Insert: {
          id?: string
          seller_id: string
          url: string
          succeeded: boolean
          error_message?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['seller_extraction_history']['Insert']>
        Relationships: []
      }
      audit_log: {
        Row: {
          id: string
          staff_id: string | null
          action: string
          entity_type: string
          entity_id: string | null
          details: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          staff_id?: string | null
          action: string
          entity_type: string
          entity_id?: string | null
          details?: Json | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['audit_log']['Insert']>
        Relationships: []
      }
      order_item_issues: {
        Row: {
          id: string
          order_id: string
          order_item_id: string
          user_id: string
          issue_type: string
          staff_note: string | null
          customer_note: string | null
          photo_url: string | null
          seller_refund_obtained: boolean | null
          resolution: string
          personal_coupon_id: string | null
          whatsapp_sent: boolean
          whatsapp_sent_at: string | null
          created_by: string | null
          resolved_at: string | null
          // Set for real once the item's replacement has actually been
          // bought again — see data/wishdrop-qc-repurchase-signal.sql.
          // Null means "retry_same but still waiting to be repurchased".
          replacement_purchased_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          order_id: string
          order_item_id: string
          user_id: string
          issue_type: string
          staff_note?: string | null
          customer_note?: string | null
          photo_url?: string | null
          seller_refund_obtained?: boolean | null
          resolution?: string
          personal_coupon_id?: string | null
          whatsapp_sent?: boolean
          whatsapp_sent_at?: string | null
          created_by?: string | null
          resolved_at?: string | null
          replacement_purchased_at?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['order_item_issues']['Insert']>
        Relationships: []
      }
      personal_coupons: {
        Row: {
          id: string
          user_id: string
          code: string
          title: string
          discount_type: string
          discount_value: number
          min_order_value: number
          max_discount: number | null
          scope: string
          category: string
          usage_limit: string
          issued_at: string
          expires_at: string
          used_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          code: string
          title: string
          discount_type: string
          discount_value: number
          min_order_value?: number
          max_discount?: number | null
          scope?: string
          category?: string
          usage_limit?: string
          issued_at?: string
          expires_at: string
          used_at?: string | null
        }
        Update: Partial<Database['public']['Tables']['personal_coupons']['Insert']>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: {
      // Backs upsertScrapeHealth (lib/supabase/scrape-health-write.ts) —
      // see data/wishdrop-scrape-health-increment-fn.sql for why this is
      // a database-side function rather than a plain client upsert.
      increment_scrape_health: {
        Args: { p_domain: string; p_success: boolean; p_title?: string; p_image_url?: string; p_price?: string; p_error?: string }
        Returns: undefined
      }
      seller_follower_count: {
        Args: { p_platform_slug: string }
        Returns: number
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}