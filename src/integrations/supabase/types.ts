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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_state: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          actor_name: string | null
          details: Json | null
          entity_id: string | null
          entity_name: string | null
          entity_type: string | null
          id: string
          ts: string
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          actor_name?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string | null
          id?: string
          ts?: string
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          actor_name?: string | null
          details?: Json | null
          entity_id?: string | null
          entity_name?: string | null
          entity_type?: string | null
          id?: string
          ts?: string
        }
        Relationships: []
      }
      automation_configs: {
        Row: {
          config: Json
          created_at: string
          enabled: boolean
          key: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          enabled?: boolean
          key: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          enabled?: boolean
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      billing_changes: {
        Row: {
          actor_email: string
          actor_id: string | null
          actor_name: string
          created_at: string
          family_key: string
          id: string
          new_type: string
          parent_name: string
          plan_id: string | null
          previous_type: string | null
          reason: string
        }
        Insert: {
          actor_email?: string
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          family_key: string
          id?: string
          new_type: string
          parent_name?: string
          plan_id?: string | null
          previous_type?: string | null
          reason?: string
        }
        Update: {
          actor_email?: string
          actor_id?: string | null
          actor_name?: string
          created_at?: string
          family_key?: string
          id?: string
          new_type?: string
          parent_name?: string
          plan_id?: string | null
          previous_type?: string | null
          reason?: string
        }
        Relationships: []
      }
      communication_logs: {
        Row: {
          channel: string
          communication_type: string
          delivered_at: string | null
          failure_reason: string | null
          id: string
          initiated_at: string
          initiated_by: string | null
          initiated_by_email: string | null
          is_test: boolean
          metadata: Json
          parent_name: string | null
          provider_message_id: string | null
          recipient_email: string | null
          recipient_phone: string | null
          rendered_body: string | null
          rendered_subject: string | null
          school_or_program: string | null
          status: string
          student_id: string | null
          student_name: string | null
          template_id: string | null
          template_name: string | null
        }
        Insert: {
          channel?: string
          communication_type: string
          delivered_at?: string | null
          failure_reason?: string | null
          id?: string
          initiated_at?: string
          initiated_by?: string | null
          initiated_by_email?: string | null
          is_test?: boolean
          metadata?: Json
          parent_name?: string | null
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          rendered_body?: string | null
          rendered_subject?: string | null
          school_or_program?: string | null
          status?: string
          student_id?: string | null
          student_name?: string | null
          template_id?: string | null
          template_name?: string | null
        }
        Update: {
          channel?: string
          communication_type?: string
          delivered_at?: string | null
          failure_reason?: string | null
          id?: string
          initiated_at?: string
          initiated_by?: string | null
          initiated_by_email?: string | null
          is_test?: boolean
          metadata?: Json
          parent_name?: string | null
          provider_message_id?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          rendered_body?: string | null
          rendered_subject?: string | null
          school_or_program?: string | null
          status?: string
          student_id?: string | null
          student_name?: string | null
          template_id?: string | null
          template_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communication_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "communication_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_template_versions: {
        Row: {
          email_body: string
          id: string
          note: string | null
          saved_at: string
          saved_by: string | null
          saved_by_email: string | null
          subject: string
          template_id: string
          template_name: string
          version_number: number
        }
        Insert: {
          email_body: string
          id?: string
          note?: string | null
          saved_at?: string
          saved_by?: string | null
          saved_by_email?: string | null
          subject: string
          template_id: string
          template_name: string
          version_number: number
        }
        Update: {
          email_body?: string
          id?: string
          note?: string | null
          saved_at?: string
          saved_by?: string | null
          saved_by_email?: string | null
          subject?: string
          template_id?: string
          template_name?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "communication_template_versions_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "communication_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      communication_templates: {
        Row: {
          active: boolean
          communication_type: string
          created_at: string
          created_by: string | null
          eligibility_rules: Json
          email_body: string
          form_id: string | null
          id: string
          school_or_program: string
          subject: string
          template_name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          active?: boolean
          communication_type: string
          created_at?: string
          created_by?: string | null
          eligibility_rules?: Json
          email_body: string
          form_id?: string | null
          id?: string
          school_or_program: string
          subject: string
          template_name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          active?: boolean
          communication_type?: string
          created_at?: string
          created_by?: string | null
          eligibility_rules?: Json
          email_body?: string
          form_id?: string | null
          id?: string
          school_or_program?: string
          subject?: string
          template_name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      email_history: {
        Row: {
          bcc: string | null
          cc: string | null
          created_at: string
          error: string | null
          id: string
          metadata: Json
          recipient: string
          resend_id: string | null
          sent_at: string
          sent_by_email: string | null
          sent_by_name: string | null
          status: string
          subject: string
          template_key: string | null
        }
        Insert: {
          bcc?: string | null
          cc?: string | null
          created_at?: string
          error?: string | null
          id?: string
          metadata?: Json
          recipient: string
          resend_id?: string | null
          sent_at?: string
          sent_by_email?: string | null
          sent_by_name?: string | null
          status?: string
          subject?: string
          template_key?: string | null
        }
        Update: {
          bcc?: string | null
          cc?: string | null
          created_at?: string
          error?: string | null
          id?: string
          metadata?: Json
          recipient?: string
          resend_id?: string | null
          sent_at?: string
          sent_by_email?: string | null
          sent_by_name?: string | null
          status?: string
          subject?: string
          template_key?: string | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          body_html: string
          body_text: string
          created_at: string
          description: string | null
          key: string
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          body_html?: string
          body_text?: string
          created_at?: string
          description?: string | null
          key: string
          name: string
          subject?: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          body_text?: string
          created_at?: string
          description?: string | null
          key?: string
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      family_billing: {
        Row: {
          billing_type: string
          created_at: string
          family_key: string
          id: string
          parent_email: string
          parent_name: string
          school_name: string
          student_names: string
          updated_at: string
          updated_by: string | null
          updated_by_email: string
        }
        Insert: {
          billing_type?: string
          created_at?: string
          family_key: string
          id?: string
          parent_email?: string
          parent_name?: string
          school_name?: string
          student_names?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_email?: string
        }
        Update: {
          billing_type?: string
          created_at?: string
          family_key?: string
          id?: string
          parent_email?: string
          parent_name?: string
          school_name?: string
          student_names?: string
          updated_at?: string
          updated_by?: string | null
          updated_by_email?: string
        }
        Relationships: []
      }
      financial_aid_history: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          actor_name: string | null
          created_at: string
          family_key: string | null
          id: string
          new_values: Json | null
          notes: string | null
          previous_values: Json | null
          student_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          family_key?: string | null
          id?: string
          new_values?: Json | null
          notes?: string | null
          previous_values?: Json | null
          student_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          actor_name?: string | null
          created_at?: string
          family_key?: string | null
          id?: string
          new_values?: Json | null
          notes?: string | null
          previous_values?: Json | null
          student_id?: string | null
        }
        Relationships: []
      }
      forms_config: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      payment_installments: {
        Row: {
          amount: number
          amount_paid: number
          created_at: string
          due_date: string
          id: string
          notes: string
          paid_at: string | null
          plan_id: string
          sequence: number
          status: string
          updated_at: string
          waived: boolean
        }
        Insert: {
          amount?: number
          amount_paid?: number
          created_at?: string
          due_date: string
          id?: string
          notes?: string
          paid_at?: string | null
          plan_id: string
          sequence: number
          status?: string
          updated_at?: string
          waived?: boolean
        }
        Update: {
          amount?: number
          amount_paid?: number
          created_at?: string
          due_date?: string
          id?: string
          notes?: string
          paid_at?: string | null
          plan_id?: string
          sequence?: number
          status?: string
          updated_at?: string
          waived?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "payment_installments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_plans: {
        Row: {
          amount_paid: number
          billing_type_after: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_by_email: string | null
          cancelled_reason: string | null
          created_at: string
          created_by: string | null
          custom_days: number | null
          down_payment: number
          family_key: string
          frequency: string
          id: string
          installment_amount: number
          installment_count: number
          last_payment_date: string | null
          next_due_date: string | null
          notes: string
          parent_email: string
          parent_name: string
          parent_phone: string
          remaining_balance: number
          school_name: string
          start_date: string
          status: string
          student_names: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          billing_type_after?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_email?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          custom_days?: number | null
          down_payment?: number
          family_key: string
          frequency?: string
          id?: string
          installment_amount?: number
          installment_count?: number
          last_payment_date?: string | null
          next_due_date?: string | null
          notes?: string
          parent_email?: string
          parent_name?: string
          parent_phone?: string
          remaining_balance?: number
          school_name?: string
          start_date?: string
          status?: string
          student_names?: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          billing_type_after?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_by_email?: string | null
          cancelled_reason?: string | null
          created_at?: string
          created_by?: string | null
          custom_days?: number | null
          down_payment?: number
          family_key?: string
          frequency?: string
          id?: string
          installment_amount?: number
          installment_count?: number
          last_payment_date?: string | null
          next_due_date?: string | null
          notes?: string
          parent_email?: string
          parent_name?: string
          parent_phone?: string
          remaining_balance?: number
          school_name?: string
          start_date?: string
          status?: string
          student_names?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_records: {
        Row: {
          amount: number
          analytics_excluded: boolean
          confirmation_number: string
          created_at: string
          excluded_reason: string | null
          id: string
          installment_id: string | null
          kind: string
          method: string
          notes: string
          payment_date: string
          plan_id: string
          removed_by_staff: string | null
          removed_from_plan_at: string | null
          staff_email: string
          staff_id: string | null
          staff_name: string
        }
        Insert: {
          amount: number
          analytics_excluded?: boolean
          confirmation_number?: string
          created_at?: string
          excluded_reason?: string | null
          id?: string
          installment_id?: string | null
          kind?: string
          method?: string
          notes?: string
          payment_date?: string
          plan_id: string
          removed_by_staff?: string | null
          removed_from_plan_at?: string | null
          staff_email?: string
          staff_id?: string | null
          staff_name?: string
        }
        Update: {
          amount?: number
          analytics_excluded?: boolean
          confirmation_number?: string
          created_at?: string
          excluded_reason?: string | null
          id?: string
          installment_id?: string | null
          kind?: string
          method?: string
          notes?: string
          payment_date?: string
          plan_id?: string
          removed_by_staff?: string | null
          removed_from_plan_at?: string | null
          staff_email?: string
          staff_id?: string | null
          staff_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_records_installment_id_fkey"
            columns: ["installment_id"]
            isOneToOne: false
            referencedRelation: "payment_installments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_records_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      school_contacts: {
        Row: {
          contact_name: string
          created_at: string
          email: string
          id: string
          notes: string
          phone: string
          school_name: string
          title: string
          updated_at: string
        }
        Insert: {
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          notes?: string
          phone?: string
          school_name: string
          title?: string
          updated_at?: string
        }
        Update: {
          contact_name?: string
          created_at?: string
          email?: string
          id?: string
          notes?: string
          phone?: string
          school_name?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          data: Json
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          data: Json
          id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          data?: Json
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      sync_history: {
        Row: {
          added: number
          created_by: string | null
          data: Json | null
          id: string
          total: number
          ts: string
          updated: number
        }
        Insert: {
          added?: number
          created_by?: string | null
          data?: Json | null
          id: string
          total?: number
          ts?: string
          updated?: number
        }
        Update: {
          added?: number
          created_by?: string | null
          data?: Json | null
          id?: string
          total?: number
          ts?: string
          updated?: number
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_audit_entry: {
        Args: {
          _action: string
          _details?: Json
          _entity_id?: string
          _entity_name?: string
          _entity_type?: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
