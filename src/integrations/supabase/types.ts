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
      admin_audit_log: {
        Row: {
          actor_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json
          permission_key: string | null
          project_id: string | null
          report_id: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          summary: string
          target_user_id: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          permission_key?: string | null
          project_id?: string | null
          report_id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          summary: string
          target_user_id?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          permission_key?: string | null
          project_id?: string | null
          report_id?: string | null
          role?: Database["public"]["Enums"]["app_role"] | null
          summary?: string
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_log_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "admin_audit_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_log_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          currency: string
          description: string
          expense_date: string
          id: string
          project_id: string
          receipt_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_by: string
          updated_at: string
          vendor: string | null
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          currency?: string
          description: string
          expense_date?: string
          id?: string
          project_id: string
          receipt_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by: string
          updated_at?: string
          vendor?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          currency?: string
          description?: string
          expense_date?: string
          id?: string
          project_id?: string
          receipt_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_by?: string
          updated_at?: string
          vendor?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      permissions: {
        Row: {
          created_at: string
          description: string
          key: string
          label: string
        }
        Insert: {
          created_at?: string
          description: string
          key: string
          label: string
        }
        Update: {
          created_at?: string
          description?: string
          key?: string
          label?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          department_id: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          job_title: string | null
          phone: string | null
          resume: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean
          job_title?: string | null
          phone?: string | null
          resume?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          department_id?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          job_title?: string | null
          phone?: string | null
          resume?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      project_git_events: {
        Row: {
          author_name: string | null
          created_at: string
          description: string | null
          event_url: string | null
          external_id: string
          id: string
          occurred_at: string
          project_id: string
          provider: string
          repository_full_name: string
          synced_at: string
          title: string
        }
        Insert: {
          author_name?: string | null
          created_at?: string
          description?: string | null
          event_url?: string | null
          external_id: string
          id?: string
          occurred_at: string
          project_id: string
          provider?: string
          repository_full_name: string
          synced_at?: string
          title: string
        }
        Update: {
          author_name?: string | null
          created_at?: string
          description?: string | null
          event_url?: string | null
          external_id?: string
          id?: string
          occurred_at?: string
          project_id?: string
          provider?: string
          repository_full_name?: string
          synced_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_git_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      project_milestones: {
        Row: {
          achieved_at: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_achieved: boolean
          project_id: string
          target_date: string | null
          title: string
          updated_at: string
        }
        Insert: {
          achieved_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_achieved?: boolean
          project_id: string
          target_date?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          achieved_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_achieved?: boolean
          project_id?: string
          target_date?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          due_date: string | null
          id: string
          is_completed: boolean
          project_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          project_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_completed?: boolean
          project_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          area_km2: number | null
          category: string
          color: string | null
          created_at: string
          department_id: string | null
          description: string | null
          fund_amount: number | null
          fund_currency: string
          id: string
          legal_name: string | null
          license_status: string
          location: string | null
          mining_method: string
          name: string
          owner_id: string | null
          project_code: string | null
          repository_url: string | null
          reserve_kg: number | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
          url: string | null
        }
        Insert: {
          area_km2?: number | null
          category?: string
          color?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          fund_amount?: number | null
          fund_currency?: string
          id?: string
          legal_name?: string | null
          license_status?: string
          location?: string | null
          mining_method?: string
          name: string
          owner_id?: string | null
          project_code?: string | null
          repository_url?: string | null
          reserve_kg?: number | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          url?: string | null
        }
        Update: {
          area_km2?: number | null
          category?: string
          color?: string | null
          created_at?: string
          department_id?: string | null
          description?: string | null
          fund_amount?: number | null
          fund_currency?: string
          id?: string
          legal_name?: string | null
          license_status?: string
          location?: string | null
          mining_method?: string
          name?: string
          owner_id?: string | null
          project_code?: string | null
          repository_url?: string | null
          reserve_kg?: number | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          activity_detail: string | null
          blockers: string | null
          content: string
          created_at: string
          hours_spent: number
          id: string
          image_urls: string[] | null
          links: string | null
          output_quantity: number | null
          output_unit: string | null
          project_id: string | null
          report_date: string
          report_time: string
          report_type: Database["public"]["Enums"]["report_type"]
          shift: string
          title: string
          updated_at: string
          user_id: string
          work_status: string
        }
        Insert: {
          activity_detail?: string | null
          blockers?: string | null
          content: string
          created_at?: string
          hours_spent?: number
          id?: string
          image_urls?: string[] | null
          links?: string | null
          output_quantity?: number | null
          output_unit?: string | null
          project_id?: string | null
          report_date?: string
          report_time?: string
          report_type?: Database["public"]["Enums"]["report_type"]
          shift?: string
          title: string
          updated_at?: string
          user_id: string
          work_status?: string
        }
        Update: {
          activity_detail?: string | null
          blockers?: string | null
          content?: string
          created_at?: string
          hours_spent?: number
          id?: string
          image_urls?: string[] | null
          links?: string | null
          output_quantity?: number | null
          output_unit?: string | null
          project_id?: string | null
          report_date?: string
          report_time?: string
          report_type?: Database["public"]["Enums"]["report_type"]
          shift?: string
          title?: string
          updated_at?: string
          user_id?: string
          work_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      role_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          target_user_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          target_user_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          target_user_id?: string
        }
        Relationships: []
      }
      role_permissions: {
        Row: {
          created_at: string
          enabled: boolean
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          permission_key: string
          role: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          permission_key?: string
          role?: Database["public"]["Enums"]["app_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_key_fkey"
            columns: ["permission_key"]
            isOneToOne: false
            referencedRelation: "permissions"
            referencedColumns: ["key"]
          },
        ]
      }
      staff_compensation: {
        Row: {
          created_at: string
          currency: string
          salary_amount: number
          salary_type: string
          standard_hours: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          salary_amount?: number
          salary_type?: string
          standard_hours?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          salary_amount?: number
          salary_type?: string
          standard_hours?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_compensation_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_project_progress: {
        Args: { _project_id: string }
        Returns: boolean
      }
      can_view_project: {
        Args: { _project_id: string; _user_id: string }
        Returns: boolean
      }
      can_view_reports_of: { Args: { _author: string }; Returns: boolean }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_permission: {
        Args: { _permission_key: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      my_department: { Args: never; Returns: string }
      user_department: { Args: { _user_id: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "boss" | "manager" | "staff"
      project_status: "active" | "paused" | "completed" | "archived"
      report_type:
        | "content_input"
        | "create_develop"
        | "study_research"
        | "planning_brainstorm"
        | "analysis"
        | "meeting"
        | "support"
        | "other"
        | "site_operations"
        | "exploration"
        | "extraction"
        | "processing"
        | "logistics"
        | "maintenance"
        | "safety"
        | "administration"
        | "normal_activity"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "boss", "manager", "staff"],
      project_status: ["active", "paused", "completed", "archived"],
      report_type: [
        "content_input",
        "create_develop",
        "study_research",
        "planning_brainstorm",
        "analysis",
        "meeting",
        "support",
        "other",
        "site_operations",
        "exploration",
        "extraction",
        "processing",
        "logistics",
        "maintenance",
        "safety",
        "administration",
        "normal_activity",
      ],
    },
  },
} as const
