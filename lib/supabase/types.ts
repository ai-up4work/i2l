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
          avatar_url: string | null
          chat_handle: string | null
          created_at: string
          updated_at: string
          referral_code: string | null
        }
        Insert: {
          id: string
          full_name: string
          email: string
          phone?: string | null
          phone_verified?: boolean
          avatar_url?: string | null
          chat_handle?: string | null
          created_at?: string
          updated_at?: string
          referral_code?: string | null
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
        }
        Insert: {
          id?: string
          user_id: string
          product_snapshot_id: string
          quantity?: number
          selected_options?: Json | null
          added_at?: string
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
          last_activity: string
          unread: boolean
        }
        Insert: {
          id?: string
          user_id: string
          request_id?: string | null
          order_id?: string | null
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
          link: string
          note: string | null
          screenshot_url: string | null
          source_domain: string
          status: string
          quote: number | null
          chat_thread_id: string
          assigned_staff_id: string | null
          submitted_at: string
        }
        Insert: {
          id?: string
          user_id: string
          link: string
          note?: string | null
          screenshot_url?: string | null
          source_domain: string
          status?: string
          quote?: number | null
          chat_thread_id: string
          assigned_staff_id?: string | null
          submitted_at?: string
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
          sent_via_whatsapp: boolean
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
          sent_via_whatsapp?: boolean
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
        }
        Insert: {
          id?: string
          display_id: string
          user_id: string
          channel: 1 | 2 | 3
          stage?: string
          currency?: string
          total_value?: number
          delayed?: boolean
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
      sites: {
        Row: {
          id: string
          name: string
          location: string
          headcount: number
          active: boolean
        }
        Insert: {
          id?: string
          name: string
          location: string
          headcount?: number
          active?: boolean
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
          role: string
          site_id: string | null
          status: string
          last_login: string | null
        }
        Insert: {
          id?: string
          user_id?: string | null
          name: string
          email: string
          role: string
          site_id?: string | null
          status?: string
          last_login?: string | null
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
        }
        Insert: {
          domain: string
          fail_count?: number
          success_count?: number
          last_failure?: string | null
          linked_seller_id?: string | null
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
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}