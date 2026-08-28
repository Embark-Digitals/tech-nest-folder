export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          city: string
          country: string
          created_at: string
          id: string
          is_default: boolean
          label: string | null
          line1: string
          line2: string | null
          phone: string | null
          postal_code: string
          province: string
          recipient_name: string
          suburb: string | null
          user_id: string
        }
        Insert: {
          city: string
          country?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string | null
          line1: string
          line2?: string | null
          phone?: string | null
          postal_code: string
          province: string
          recipient_name: string
          suburb?: string | null
          user_id: string
        }
        Update: {
          city?: string
          country?: string
          created_at?: string
          id?: string
          is_default?: boolean
          label?: string | null
          line1?: string
          line2?: string | null
          phone?: string | null
          postal_code?: string
          province?: string
          recipient_name?: string
          suburb?: string | null
          user_id?: string
        }
        Relationships: []
      }
      brands: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          logo_url: string | null
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          logo_url?: string | null
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          cart_id: string
          created_at: string
          id: string
          product_id: string
          quantity: number
        }
        Insert: {
          cart_id: string
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
        }
        Update: {
          cart_id?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      carts: {
        Row: {
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      catalogue_change_log: {
        Row: {
          action: string
          applied_at: string
          applied_by: string | null
          field: string | null
          id: string
          import_id: string | null
          new_value: Json | null
          old_value: Json | null
          product_id: string | null
          row_id: string | null
        }
        Insert: {
          action: string
          applied_at?: string
          applied_by?: string | null
          field?: string | null
          id?: string
          import_id?: string | null
          new_value?: Json | null
          old_value?: Json | null
          product_id?: string | null
          row_id?: string | null
        }
        Update: {
          action?: string
          applied_at?: string
          applied_by?: string | null
          field?: string | null
          id?: string
          import_id?: string | null
          new_value?: Json | null
          old_value?: Json | null
          product_id?: string | null
          row_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_change_log_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "catalogue_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_change_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_change_log_row_id_fkey"
            columns: ["row_id"]
            isOneToOne: false
            referencedRelation: "catalogue_import_rows"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_import_errors: {
        Row: {
          created_at: string
          error_type: string
          id: string
          import_id: string
          message: string
          product_code: string | null
          raw_row: Json | null
          row_number: number | null
        }
        Insert: {
          created_at?: string
          error_type: string
          id?: string
          import_id: string
          message: string
          product_code?: string | null
          raw_row?: Json | null
          row_number?: number | null
        }
        Update: {
          created_at?: string
          error_type?: string
          id?: string
          import_id?: string
          message?: string
          product_code?: string | null
          raw_row?: Json | null
          row_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_import_errors_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "catalogue_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_import_rows: {
        Row: {
          ai_assisted: boolean
          ai_fields: Json
          change_type: Database["public"]["Enums"]["import_change_type"]
          computed_price_incl_vat: number | null
          confidence_band: Database["public"]["Enums"]["import_confidence"]
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision: Database["public"]["Enums"]["import_decision"]
          id: string
          import_id: string
          match_confidence: number | null
          match_method: string | null
          match_reason: string | null
          matched_product_id: string | null
          model_number: string | null
          normalised: Json
          part_number: string | null
          product_name: string | null
          proposed_changes: Json
          raw_row: Json
          review_reason: string | null
          source_page: number | null
          source_row_number: number | null
          source_section: string | null
          source_worksheet: string | null
          supplier_sku: string | null
          updated_at: string
          validation_error: string | null
        }
        Insert: {
          ai_assisted?: boolean
          ai_fields?: Json
          change_type?: Database["public"]["Enums"]["import_change_type"]
          computed_price_incl_vat?: number | null
          confidence_band?: Database["public"]["Enums"]["import_confidence"]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: Database["public"]["Enums"]["import_decision"]
          id?: string
          import_id: string
          match_confidence?: number | null
          match_method?: string | null
          match_reason?: string | null
          matched_product_id?: string | null
          model_number?: string | null
          normalised?: Json
          part_number?: string | null
          product_name?: string | null
          proposed_changes?: Json
          raw_row?: Json
          review_reason?: string | null
          source_page?: number | null
          source_row_number?: number | null
          source_section?: string | null
          source_worksheet?: string | null
          supplier_sku?: string | null
          updated_at?: string
          validation_error?: string | null
        }
        Update: {
          ai_assisted?: boolean
          ai_fields?: Json
          change_type?: Database["public"]["Enums"]["import_change_type"]
          computed_price_incl_vat?: number | null
          confidence_band?: Database["public"]["Enums"]["import_confidence"]
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision?: Database["public"]["Enums"]["import_decision"]
          id?: string
          import_id?: string
          match_confidence?: number | null
          match_method?: string | null
          match_reason?: string | null
          matched_product_id?: string | null
          model_number?: string | null
          normalised?: Json
          part_number?: string | null
          product_name?: string | null
          proposed_changes?: Json
          raw_row?: Json
          review_reason?: string | null
          source_page?: number | null
          source_row_number?: number | null
          source_section?: string | null
          source_worksheet?: string | null
          supplier_sku?: string | null
          updated_at?: string
          validation_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "catalogue_import_rows_import_id_fkey"
            columns: ["import_id"]
            isOneToOne: false
            referencedRelation: "catalogue_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalogue_import_rows_matched_product_id_fkey"
            columns: ["matched_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      catalogue_imports: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          catalogue_date: string | null
          created_at: string
          created_count: number
          error_count: number
          extraction_method: string | null
          file_checksum: string | null
          file_name: string
          id: string
          imported_by: string | null
          is_test: boolean
          original_filename: string | null
          parser_version: string | null
          pricing_snapshot: Json | null
          rejected_count: number
          review_count: number
          rows_examined: number
          skipped_count: number
          status: Database["public"]["Enums"]["import_status"]
          storage_path: string | null
          summary: Json | null
          supplier: string | null
          total_rows: number
          updated_count: number
          warnings: Json
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          catalogue_date?: string | null
          created_at?: string
          created_count?: number
          error_count?: number
          extraction_method?: string | null
          file_checksum?: string | null
          file_name: string
          id?: string
          imported_by?: string | null
          is_test?: boolean
          original_filename?: string | null
          parser_version?: string | null
          pricing_snapshot?: Json | null
          rejected_count?: number
          review_count?: number
          rows_examined?: number
          skipped_count?: number
          status?: Database["public"]["Enums"]["import_status"]
          storage_path?: string | null
          summary?: Json | null
          supplier?: string | null
          total_rows?: number
          updated_count?: number
          warnings?: Json
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          catalogue_date?: string | null
          created_at?: string
          created_count?: number
          error_count?: number
          extraction_method?: string | null
          file_checksum?: string | null
          file_name?: string
          id?: string
          imported_by?: string | null
          is_test?: boolean
          original_filename?: string | null
          parser_version?: string | null
          pricing_snapshot?: Json | null
          rejected_count?: number
          review_count?: number
          rows_examined?: number
          skipped_count?: number
          status?: Database["public"]["Enums"]["import_status"]
          storage_path?: string | null
          summary?: Json | null
          supplier?: string | null
          total_rows?: number
          updated_count?: number
          warnings?: Json
        }
        Relationships: []
      }
      categories: {
        Row: {
          banner_url: string | null
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          parent_id: string | null
          seo_description: string | null
          seo_title: string | null
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          parent_id?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parent_id?: string | null
          seo_description?: string | null
          seo_title?: string | null
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_messages: {
        Row: {
          created_at: string
          email: string
          handled_by: string | null
          id: string
          message: string
          name: string
          order_number: string | null
          phone: string | null
          reason: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          handled_by?: string | null
          id?: string
          message: string
          name: string
          order_number?: string | null
          phone?: string | null
          reason?: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          handled_by?: string | null
          id?: string
          message?: string
          name?: string
          order_number?: string | null
          phone?: string | null
          reason?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      crm_notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_notes_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          details: string | null
          due_date: string | null
          id: string
          order_id: string | null
          status: Database["public"]["Enums"]["crm_task_status"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          details?: string | null
          due_date?: string | null
          id?: string
          order_id?: string | null
          status?: Database["public"]["Enums"]["crm_task_status"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          details?: string | null
          due_date?: string | null
          id?: string
          order_id?: string | null
          status?: Database["public"]["Enums"]["crm_task_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_tasks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_class_rules: {
        Row: {
          collection_only: boolean
          created_at: string
          delivery_class: Database["public"]["Enums"]["delivery_class"]
          id: string
          is_active: boolean
          label: string
          requires_manual_quote: boolean
          surcharge: number
          updated_at: string
        }
        Insert: {
          collection_only?: boolean
          created_at?: string
          delivery_class: Database["public"]["Enums"]["delivery_class"]
          id?: string
          is_active?: boolean
          label: string
          requires_manual_quote?: boolean
          surcharge?: number
          updated_at?: string
        }
        Update: {
          collection_only?: boolean
          created_at?: string
          delivery_class?: Database["public"]["Enums"]["delivery_class"]
          id?: string
          is_active?: boolean
          label?: string
          requires_manual_quote?: boolean
          surcharge?: number
          updated_at?: string
        }
        Relationships: []
      }
      delivery_enquiries: {
        Row: {
          address_line1: string | null
          city: string | null
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string
          estimated_subtotal_incl_vat: number | null
          handled_by: string | null
          id: string
          items: Json
          message: string | null
          postal_code: string | null
          province: string
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address_line1?: string | null
          city?: string | null
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          estimated_subtotal_incl_vat?: number | null
          handled_by?: string | null
          id?: string
          items?: Json
          message?: string | null
          postal_code?: string | null
          province: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address_line1?: string | null
          city?: string | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          estimated_subtotal_incl_vat?: number | null
          handled_by?: string | null
          id?: string
          items?: Json
          message?: string | null
          postal_code?: string | null
          province?: string
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      email_events: {
        Row: {
          attempted_at: string | null
          created_at: string
          dedupe_key: string
          event_type: string
          failure_reason: string | null
          id: string
          is_test: boolean
          order_id: string | null
          payload: Json
          provider_message_id: string | null
          recipient: string
          retry_count: number
          status: Database["public"]["Enums"]["email_status"]
          updated_at: string
        }
        Insert: {
          attempted_at?: string | null
          created_at?: string
          dedupe_key: string
          event_type: string
          failure_reason?: string | null
          id?: string
          is_test?: boolean
          order_id?: string | null
          payload?: Json
          provider_message_id?: string | null
          recipient: string
          retry_count?: number
          status?: Database["public"]["Enums"]["email_status"]
          updated_at?: string
        }
        Update: {
          attempted_at?: string | null
          created_at?: string
          dedupe_key?: string
          event_type?: string
          failure_reason?: string | null
          id?: string
          is_test?: boolean
          order_id?: string | null
          payload?: Json
          provider_message_id?: string | null
          recipient?: string
          retry_count?: number
          status?: Database["public"]["Enums"]["email_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_events_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          id: string
          line_total_incl_vat: number
          name: string
          order_id: string
          product_id: string | null
          quantity: number
          sku: string
          unit_price_incl_vat: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total_incl_vat: number
          name: string
          order_id: string
          product_id?: string | null
          quantity: number
          sku: string
          unit_price_incl_vat: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total_incl_vat?: number
          name?: string
          order_id?: string
          product_id?: string | null
          quantity?: number
          sku?: string
          unit_price_incl_vat?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_status_history: {
        Row: {
          changed_by: string | null
          created_at: string
          id: string
          note: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id: string
          status: Database["public"]["Enums"]["order_status"]
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          id?: string
          note?: string | null
          order_id?: string
          status?: Database["public"]["Enums"]["order_status"]
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          admin_notes: string | null
          assigned_to: string | null
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string
          customer_notes: string | null
          delivery_address: Json | null
          delivery_estimate: string | null
          delivery_fee: number
          delivery_method: string | null
          delivery_province: string | null
          delivery_quote: Json | null
          delivery_surcharges: Json
          delivery_zone_id: string | null
          delivery_zone_name: string | null
          id: string
          idempotency_key: string | null
          order_number: string
          payment_confirmed_at: string | null
          payment_confirmed_by: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_source: string
          payment_status: string
          pipeline_stage: Database["public"]["Enums"]["pipeline_stage"]
          status: Database["public"]["Enums"]["order_status"]
          stock_released: boolean
          subtotal_incl_vat: number
          total_incl_vat: number
          updated_at: string
          user_id: string | null
          vat_amount: number
        }
        Insert: {
          admin_notes?: string | null
          assigned_to?: string | null
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          customer_notes?: string | null
          delivery_address?: Json | null
          delivery_estimate?: string | null
          delivery_fee?: number
          delivery_method?: string | null
          delivery_province?: string | null
          delivery_quote?: Json | null
          delivery_surcharges?: Json
          delivery_zone_id?: string | null
          delivery_zone_name?: string | null
          id?: string
          idempotency_key?: string | null
          order_number?: string
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_source?: string
          payment_status?: string
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          status?: Database["public"]["Enums"]["order_status"]
          stock_released?: boolean
          subtotal_incl_vat?: number
          total_incl_vat?: number
          updated_at?: string
          user_id?: string | null
          vat_amount?: number
        }
        Update: {
          admin_notes?: string | null
          assigned_to?: string | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          customer_notes?: string | null
          delivery_address?: Json | null
          delivery_estimate?: string | null
          delivery_fee?: number
          delivery_method?: string | null
          delivery_province?: string | null
          delivery_quote?: Json | null
          delivery_surcharges?: Json
          delivery_zone_id?: string | null
          delivery_zone_name?: string | null
          id?: string
          idempotency_key?: string | null
          order_number?: string
          payment_confirmed_at?: string | null
          payment_confirmed_by?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_source?: string
          payment_status?: string
          pipeline_stage?: Database["public"]["Enums"]["pipeline_stage"]
          status?: Database["public"]["Enums"]["order_status"]
          stock_released?: boolean
          subtotal_incl_vat?: number
          total_incl_vat?: number
          updated_at?: string
          user_id?: string | null
          vat_amount?: number
        }
        Relationships: [
          {
            foreignKeyName: "orders_delivery_zone_id_fkey"
            columns: ["delivery_zone_id"]
            isOneToOne: false
            referencedRelation: "shipping_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_audit_log: {
        Row: {
          action: string
          changed_by: string | null
          created_at: string
          id: string
          new_values: Json | null
          old_values: Json | null
          product_id: string | null
        }
        Insert: {
          action: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          product_id?: string | null
        }
        Update: {
          action?: string
          changed_by?: string | null
          created_at?: string
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          product_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_audit_log_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      pricing_settings: {
        Row: {
          auto_recalculate: boolean
          created_at: string
          id: string
          markup_rate: number
          price_source: string
          rounding: Database["public"]["Enums"]["rounding_method"]
          updated_at: string
          updated_by: string | null
          vat_rate: number
        }
        Insert: {
          auto_recalculate?: boolean
          created_at?: string
          id?: string
          markup_rate?: number
          price_source?: string
          rounding?: Database["public"]["Enums"]["rounding_method"]
          updated_at?: string
          updated_by?: string | null
          vat_rate?: number
        }
        Update: {
          auto_recalculate?: boolean
          created_at?: string
          id?: string
          markup_rate?: number
          price_source?: string
          rounding?: Database["public"]["Enums"]["rounding_method"]
          updated_at?: string
          updated_by?: string | null
          vat_rate?: number
        }
        Relationships: []
      }
      product_images: {
        Row: {
          alt_text: string | null
          created_at: string
          id: string
          is_primary: boolean
          product_id: string
          sort_order: number
          url: string
        }
        Insert: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id: string
          sort_order?: number
          url: string
        }
        Update: {
          alt_text?: string | null
          created_at?: string
          id?: string
          is_primary?: boolean
          product_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_specifications: {
        Row: {
          id: string
          product_id: string
          sort_order: number
          spec_key: string
          spec_value: string
        }
        Insert: {
          id?: string
          product_id: string
          sort_order?: number
          spec_key: string
          spec_value: string
        }
        Update: {
          id?: string
          product_id?: string
          sort_order?: number
          spec_key?: string
          spec_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_specifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand_id: string | null
          brand_review_required: boolean
          brand_verified: boolean
          capacity: string | null
          catalogue_review_reason: string | null
          category_id: string | null
          category_verified: boolean
          colour: string | null
          created_at: string
          dealer_price_ex_vat: number | null
          delivery_class: Database["public"]["Enums"]["delivery_class"]
          delivery_note: string | null
          delivery_restricted: boolean
          full_description: string | null
          id: string
          image_required: boolean
          import_batch_id: string | null
          import_status: string | null
          inventory_mode: Database["public"]["Enums"]["inventory_mode"]
          is_clearance: boolean
          is_discontinued: boolean
          is_featured: boolean
          is_new_arrival: boolean
          is_promotional: boolean
          is_published: boolean
          last_seen_import_id: string | null
          low_stock_threshold: number
          manual_price_override: number | null
          markup_amount: number | null
          markup_rate: number
          model_number: string | null
          name: string
          override_at: string | null
          override_by: string | null
          override_reason: string | null
          part_number: string | null
          previous_price_incl_vat: number | null
          pricing_review_required: boolean
          promotional_price_ex_vat: number | null
          quantity: number | null
          review_locked: boolean
          screen_size: string | null
          selling_price_ex_vat: number | null
          selling_price_incl_vat: number | null
          seo_description: string | null
          seo_title: string | null
          short_description: string | null
          sku: string
          slug: string
          source_availability_raw: string | null
          source_row_number: number | null
          source_section: string | null
          source_type: string | null
          source_workbook: string | null
          source_worksheet: string | null
          spec_review_required: boolean
          specifications_text: string | null
          stock_status: Database["public"]["Enums"]["stock_status"]
          subcategory_id: string | null
          supplier_availability: Database["public"]["Enums"]["supplier_availability"]
          supplier_availability_note: string | null
          supplier_price_anomaly: boolean
          supplier_sku: string | null
          updated_at: string
          vat_amount: number | null
          vat_rate: number
        }
        Insert: {
          brand_id?: string | null
          brand_review_required?: boolean
          brand_verified?: boolean
          capacity?: string | null
          catalogue_review_reason?: string | null
          category_id?: string | null
          category_verified?: boolean
          colour?: string | null
          created_at?: string
          dealer_price_ex_vat?: number | null
          delivery_class?: Database["public"]["Enums"]["delivery_class"]
          delivery_note?: string | null
          delivery_restricted?: boolean
          full_description?: string | null
          id?: string
          image_required?: boolean
          import_batch_id?: string | null
          import_status?: string | null
          inventory_mode?: Database["public"]["Enums"]["inventory_mode"]
          is_clearance?: boolean
          is_discontinued?: boolean
          is_featured?: boolean
          is_new_arrival?: boolean
          is_promotional?: boolean
          is_published?: boolean
          last_seen_import_id?: string | null
          low_stock_threshold?: number
          manual_price_override?: number | null
          markup_amount?: number | null
          markup_rate?: number
          model_number?: string | null
          name: string
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          part_number?: string | null
          previous_price_incl_vat?: number | null
          pricing_review_required?: boolean
          promotional_price_ex_vat?: number | null
          quantity?: number | null
          review_locked?: boolean
          screen_size?: string | null
          selling_price_ex_vat?: number | null
          selling_price_incl_vat?: number | null
          seo_description?: string | null
          seo_title?: string | null
          short_description?: string | null
          sku: string
          slug: string
          source_availability_raw?: string | null
          source_row_number?: number | null
          source_section?: string | null
          source_type?: string | null
          source_workbook?: string | null
          source_worksheet?: string | null
          spec_review_required?: boolean
          specifications_text?: string | null
          stock_status?: Database["public"]["Enums"]["stock_status"]
          subcategory_id?: string | null
          supplier_availability?: Database["public"]["Enums"]["supplier_availability"]
          supplier_availability_note?: string | null
          supplier_price_anomaly?: boolean
          supplier_sku?: string | null
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number
        }
        Update: {
          brand_id?: string | null
          brand_review_required?: boolean
          brand_verified?: boolean
          capacity?: string | null
          catalogue_review_reason?: string | null
          category_id?: string | null
          category_verified?: boolean
          colour?: string | null
          created_at?: string
          dealer_price_ex_vat?: number | null
          delivery_class?: Database["public"]["Enums"]["delivery_class"]
          delivery_note?: string | null
          delivery_restricted?: boolean
          full_description?: string | null
          id?: string
          image_required?: boolean
          import_batch_id?: string | null
          import_status?: string | null
          inventory_mode?: Database["public"]["Enums"]["inventory_mode"]
          is_clearance?: boolean
          is_discontinued?: boolean
          is_featured?: boolean
          is_new_arrival?: boolean
          is_promotional?: boolean
          is_published?: boolean
          last_seen_import_id?: string | null
          low_stock_threshold?: number
          manual_price_override?: number | null
          markup_amount?: number | null
          markup_rate?: number
          model_number?: string | null
          name?: string
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          part_number?: string | null
          previous_price_incl_vat?: number | null
          pricing_review_required?: boolean
          promotional_price_ex_vat?: number | null
          quantity?: number | null
          review_locked?: boolean
          screen_size?: string | null
          selling_price_ex_vat?: number | null
          selling_price_incl_vat?: number | null
          seo_description?: string | null
          seo_title?: string | null
          short_description?: string | null
          sku?: string
          slug?: string
          source_availability_raw?: string | null
          source_row_number?: number | null
          source_section?: string | null
          source_type?: string | null
          source_workbook?: string | null
          source_worksheet?: string | null
          spec_review_required?: boolean
          specifications_text?: string | null
          stock_status?: Database["public"]["Enums"]["stock_status"]
          subcategory_id?: string | null
          supplier_availability?: Database["public"]["Enums"]["supplier_availability"]
          supplier_availability_note?: string | null
          supplier_price_anomaly?: boolean
          supplier_sku?: string | null
          updated_at?: string
          vat_amount?: number | null
          vat_rate?: number
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "catalogue_imports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_subcategory_id_fkey"
            columns: ["subcategory_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      shipping_postal_rules: {
        Row: {
          action: Database["public"]["Enums"]["postal_rule_action"]
          code_from: number
          code_to: number
          created_at: string
          id: string
          is_active: boolean
          note: string | null
          override_fee: number | null
          priority: number
          province_code: string | null
          surcharge: number
          updated_at: string
          zone_id: string | null
        }
        Insert: {
          action?: Database["public"]["Enums"]["postal_rule_action"]
          code_from: number
          code_to: number
          created_at?: string
          id?: string
          is_active?: boolean
          note?: string | null
          override_fee?: number | null
          priority?: number
          province_code?: string | null
          surcharge?: number
          updated_at?: string
          zone_id?: string | null
        }
        Update: {
          action?: Database["public"]["Enums"]["postal_rule_action"]
          code_from?: number
          code_to?: number
          created_at?: string
          id?: string
          is_active?: boolean
          note?: string | null
          override_fee?: number | null
          priority?: number
          province_code?: string | null
          surcharge?: number
          updated_at?: string
          zone_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "shipping_postal_rules_province_code_fkey"
            columns: ["province_code"]
            isOneToOne: false
            referencedRelation: "shipping_provinces"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "shipping_postal_rules_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "shipping_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      shipping_provinces: {
        Row: {
          code: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      shipping_settings: {
        Row: {
          collection_address: string
          collection_enabled: boolean
          collection_instructions: string
          created_at: string
          id: string
          manual_quote_enabled: boolean
          unsupported_area_message: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          collection_address?: string
          collection_enabled?: boolean
          collection_instructions?: string
          created_at?: string
          id?: string
          manual_quote_enabled?: boolean
          unsupported_area_message?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          collection_address?: string
          collection_enabled?: boolean
          collection_instructions?: string
          created_at?: string
          id?: string
          manual_quote_enabled?: boolean
          unsupported_area_message?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      shipping_zones: {
        Row: {
          allowed_delivery_classes: Database["public"]["Enums"]["delivery_class"][]
          base_fee: number
          collection_enabled: boolean
          created_at: string
          estimate_max_days: number
          estimate_min_days: number
          free_delivery_threshold: number | null
          id: string
          is_active: boolean
          is_suspended: boolean
          name: string
          province_code: string
          remote_surcharge: number
          slug: string
          sort_order: number
          suspension_note: string | null
          updated_at: string
        }
        Insert: {
          allowed_delivery_classes?: Database["public"]["Enums"]["delivery_class"][]
          base_fee?: number
          collection_enabled?: boolean
          created_at?: string
          estimate_max_days?: number
          estimate_min_days?: number
          free_delivery_threshold?: number | null
          id?: string
          is_active?: boolean
          is_suspended?: boolean
          name: string
          province_code: string
          remote_surcharge?: number
          slug: string
          sort_order?: number
          suspension_note?: string | null
          updated_at?: string
        }
        Update: {
          allowed_delivery_classes?: Database["public"]["Enums"]["delivery_class"][]
          base_fee?: number
          collection_enabled?: boolean
          created_at?: string
          estimate_max_days?: number
          estimate_min_days?: number
          free_delivery_threshold?: number | null
          id?: string
          is_active?: boolean
          is_suspended?: boolean
          name?: string
          province_code?: string
          remote_surcharge?: number
          slug?: string
          sort_order?: number
          suspension_note?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipping_zones_province_code_fkey"
            columns: ["province_code"]
            isOneToOne: false
            referencedRelation: "shipping_provinces"
            referencedColumns: ["code"]
          },
        ]
      }
      site_settings: {
        Row: {
          checkout_mode: Database["public"]["Enums"]["checkout_mode"]
          collection_hours: string | null
          company_registration_number: string | null
          delivery_note: string
          eft_details: string | null
          id: string
          legal_last_reviewed_at: string | null
          legal_review_status: string
          legal_reviewed_by: string | null
          legal_service_address: string | null
          legal_status: string | null
          office_bearers: string | null
          order_email: string | null
          physical_address: string | null
          place_of_registration: string | null
          registered_business_name: string | null
          store_email: string
          store_phone: string
          support_email: string | null
          telephone_number: string | null
          trading_name: string | null
          updated_at: string
          website_url: string | null
          whatsapp_number: string
        }
        Insert: {
          checkout_mode?: Database["public"]["Enums"]["checkout_mode"]
          collection_hours?: string | null
          company_registration_number?: string | null
          delivery_note?: string
          eft_details?: string | null
          id?: string
          legal_last_reviewed_at?: string | null
          legal_review_status?: string
          legal_reviewed_by?: string | null
          legal_service_address?: string | null
          legal_status?: string | null
          office_bearers?: string | null
          order_email?: string | null
          physical_address?: string | null
          place_of_registration?: string | null
          registered_business_name?: string | null
          store_email?: string
          store_phone?: string
          support_email?: string | null
          telephone_number?: string | null
          trading_name?: string | null
          updated_at?: string
          website_url?: string | null
          whatsapp_number?: string
        }
        Update: {
          checkout_mode?: Database["public"]["Enums"]["checkout_mode"]
          collection_hours?: string | null
          company_registration_number?: string | null
          delivery_note?: string
          eft_details?: string | null
          id?: string
          legal_last_reviewed_at?: string | null
          legal_review_status?: string
          legal_reviewed_by?: string | null
          legal_service_address?: string | null
          legal_status?: string | null
          office_bearers?: string | null
          order_email?: string | null
          physical_address?: string | null
          place_of_registration?: string | null
          registered_business_name?: string | null
          store_email?: string
          store_phone?: string
          support_email?: string | null
          telephone_number?: string | null
          trading_name?: string | null
          updated_at?: string
          website_url?: string | null
          whatsapp_number?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wishlist_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_catalogue_import: { Args: { _import_id: string }; Returns: Json }
      confirm_manual_eft: {
        Args: {
          _amount_incl_vat: number
          _order_id: string
          _payment_reference: string
        }
        Returns: Json
      }
      flag_absent_products: {
        Args: { _import_id: string; _supplier: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: { _user_id: string }; Returns: boolean }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      mark_order_paid:
        | {
            Args: {
              _amount_incl_vat: number
              _order_id: string
              _payment_method?: string
              _payment_reference: string
            }
            Returns: Json
          }
        | {
            Args: {
              _amount_incl_vat: number
              _order_id: string
              _payment_method: string
              _payment_reference: string
            }
            Returns: Json
          }
      place_order: {
        Args: {
          _contact_email: string
          _contact_name: string
          _contact_phone: string
          _customer_notes: string
          _delivery_address: Json
          _delivery_method: string
          _idempotency_key: string
          _items: Json
        }
        Returns: Json
      }
      quote_delivery: {
        Args: {
          _city: string
          _items: Json
          _method: string
          _postal_code: string
          _province: string
        }
        Returns: Json
      }
      release_order_stock: { Args: { _order_id: string }; Returns: undefined }
      rollback_catalogue_import: { Args: { _import_id: string }; Returns: Json }
      set_order_status: {
        Args: {
          _note?: string
          _order_id: string
          _status: Database["public"]["Enums"]["order_status"]
        }
        Returns: Json
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "admin"
        | "catalogue_manager"
        | "order_manager"
        | "customer"
      checkout_mode: "live_payment" | "manual_eft" | "request_order"
      crm_task_status: "open" | "in_progress" | "done" | "cancelled"
      delivery_class:
        | "standard"
        | "fragile"
        | "oversized"
        | "heavy"
        | "supplier_confirmation"
        | "collection_only"
      email_status:
        | "pending"
        | "sent"
        | "failed"
        | "skipped_duplicate"
        | "suppressed"
      import_change_type:
        | "new"
        | "update"
        | "unchanged"
        | "missing"
        | "discontinued"
        | "ambiguous"
        | "error"
        | "ignored"
      import_confidence: "high" | "medium" | "low" | "manual_review"
      import_decision:
        | "pending"
        | "approved"
        | "rejected"
        | "kept_existing"
        | "applied"
        | "failed"
      import_status:
        | "pending"
        | "previewing"
        | "completed"
        | "failed"
        | "cancelled"
      inventory_mode:
        | "tracked"
        | "supplier_confirmation"
        | "unlimited"
        | "discontinued"
      order_status:
        | "new"
        | "awaiting_stock_confirmation"
        | "stock_confirmed"
        | "awaiting_payment"
        | "paid"
        | "processing"
        | "ready_for_dispatch"
        | "shipped"
        | "delivered"
        | "cancelled"
        | "refunded"
        | "ready_for_collection"
      pipeline_stage:
        | "new"
        | "contacted"
        | "quoted"
        | "negotiating"
        | "won"
        | "lost"
      postal_rule_action: "include" | "exclude" | "override" | "remote"
      rounding_method: "exact" | "nearest_rand" | "nearest_ten" | "ends_99"
      stock_status:
        | "available"
        | "low_stock"
        | "awaiting_confirmation"
        | "preorder"
        | "out_of_stock"
        | "discontinued"
      supplier_availability:
        | "in_stock"
        | "low_stock"
        | "new_in_stock"
        | "eta"
        | "clearance"
        | "end_of_life"
        | "out_of_stock"
        | "unknown"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: [
        "super_admin",
        "admin",
        "catalogue_manager",
        "order_manager",
        "customer",
      ],
      checkout_mode: ["live_payment", "manual_eft", "request_order"],
      crm_task_status: ["open", "in_progress", "done", "cancelled"],
      delivery_class: [
        "standard",
        "fragile",
        "oversized",
        "heavy",
        "supplier_confirmation",
        "collection_only",
      ],
      email_status: [
        "pending",
        "sent",
        "failed",
        "skipped_duplicate",
        "suppressed",
      ],
      import_change_type: [
        "new",
        "update",
        "unchanged",
        "missing",
        "discontinued",
        "ambiguous",
        "error",
        "ignored",
      ],
      import_confidence: ["high", "medium", "low", "manual_review"],
      import_decision: [
        "pending",
        "approved",
        "rejected",
        "kept_existing",
        "applied",
        "failed",
      ],
      import_status: [
        "pending",
        "previewing",
        "completed",
        "failed",
        "cancelled",
      ],
      inventory_mode: [
        "tracked",
        "supplier_confirmation",
        "unlimited",
        "discontinued",
      ],
      order_status: [
        "new",
        "awaiting_stock_confirmation",
        "stock_confirmed",
        "awaiting_payment",
        "paid",
        "processing",
        "ready_for_dispatch",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
        "ready_for_collection",
      ],
      pipeline_stage: [
        "new",
        "contacted",
        "quoted",
        "negotiating",
        "won",
        "lost",
      ],
      postal_rule_action: ["include", "exclude", "override", "remote"],
      rounding_method: ["exact", "nearest_rand", "nearest_ten", "ends_99"],
      stock_status: [
        "available",
        "low_stock",
        "awaiting_confirmation",
        "preorder",
        "out_of_stock",
        "discontinued",
      ],
      supplier_availability: [
        "in_stock",
        "low_stock",
        "new_in_stock",
        "eta",
        "clearance",
        "end_of_life",
        "out_of_stock",
        "unknown",
      ],
    },
  },
} as const
