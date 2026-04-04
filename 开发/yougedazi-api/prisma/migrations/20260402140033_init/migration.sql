-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending_payment', 'pending_accept', 'waiting_grab', 'accepted', 'serving', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "OrderType" AS ENUM ('direct', 'reward');

-- CreateEnum
CREATE TYPE "OperatorType" AS ENUM ('user', 'companion', 'admin', 'system');

-- CreateEnum
CREATE TYPE "AuditStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'banned', 'suspended');

-- CreateEnum
CREATE TYPE "DepositLevel" AS ENUM ('none', 'basic', 'premium');

-- CreateEnum
CREATE TYPE "MessageType" AS ENUM ('text', 'image', 'system');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('order', 'system', 'activity', 'message');

-- CreateEnum
CREATE TYPE "NotificationTarget" AS ENUM ('all', 'user', 'companion');

-- CreateEnum
CREATE TYPE "SettlementType" AS ENUM ('order_income', 'bonus', 'penalty', 'refund');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('super_admin', 'operator', 'finance', 'viewer');

-- CreateEnum
CREATE TYPE "RenewalStatus" AS ENUM ('pending', 'paid', 'failed');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('deposit', 'refund', 'deduction');

-- CreateEnum
CREATE TYPE "WithdrawalStatus" AS ENUM ('pending', 'approved', 'rejected', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "openid" TEXT NOT NULL,
    "nickname" TEXT,
    "avatar" TEXT,
    "phone" TEXT,
    "gender" INTEGER,
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "ban_reason" TEXT,
    "banned_by" TEXT,
    "banned_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companions" (
    "id" TEXT NOT NULL,
    "openid" TEXT NOT NULL,
    "nickname" TEXT,
    "avatar" TEXT,
    "phone" TEXT,
    "gender" INTEGER,
    "real_name" TEXT,
    "id_card_no" TEXT,
    "id_card_front" TEXT,
    "id_card_back" TEXT,
    "audit_status" "AuditStatus" NOT NULL DEFAULT 'pending',
    "is_online" BOOLEAN NOT NULL DEFAULT false,
    "is_working" BOOLEAN NOT NULL DEFAULT false,
    "deposit_level" "DepositLevel" NOT NULL DEFAULT 'none',
    "deposited_amount" INTEGER NOT NULL DEFAULT 0,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "rating" DECIMAL(2,1) NOT NULL DEFAULT 5.0,
    "reject_reason" TEXT,
    "verified_by" TEXT,
    "verified_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "companions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companion_services" (
    "id" TEXT NOT NULL,
    "companion_id" TEXT NOT NULL,
    "service_name" TEXT NOT NULL,
    "hourly_price" INTEGER NOT NULL,
    "min_duration" INTEGER NOT NULL DEFAULT 1,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "companion_services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companion_audit_records" (
    "id" TEXT NOT NULL,
    "companion_id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "action" "AuditStatus" NOT NULL,
    "reason" TEXT,
    "note" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "companion_audit_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "order_no" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "companion_id" TEXT,
    "service_id" TEXT,
    "order_type" "OrderType" NOT NULL DEFAULT 'direct',
    "status" "OrderStatus" NOT NULL DEFAULT 'pending_payment',
    "service_name" TEXT NOT NULL,
    "hourly_price" INTEGER NOT NULL,
    "duration" INTEGER NOT NULL,
    "total_amount" INTEGER NOT NULL,
    "paid_amount" INTEGER NOT NULL DEFAULT 0,
    "refund_amount" INTEGER NOT NULL DEFAULT 0,
    "payment_deadline" TIMESTAMPTZ,
    "accept_deadline" TIMESTAMPTZ,
    "service_start_at" TIMESTAMPTZ,
    "service_end_at" TIMESTAMPTZ,
    "completed_at" TIMESTAMPTZ,
    "cancelled_at" TIMESTAMPTZ,
    "user_remark" TEXT,
    "admin_note" TEXT,
    "intervened_by" TEXT,
    "intervention_type" TEXT,
    "dispute_reason" TEXT,
    "cancel_reason" TEXT,
    "cancel_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_operation_logs" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "operator_type" "OperatorType" NOT NULL,
    "operator_id" TEXT,
    "action" TEXT NOT NULL,
    "from_status" "OrderStatus",
    "to_status" "OrderStatus",
    "note" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_operation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_renewals" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "added_hours" INTEGER NOT NULL,
    "added_amount" INTEGER NOT NULL,
    "out_trade_no" TEXT NOT NULL,
    "status" "RenewalStatus" NOT NULL DEFAULT 'pending',
    "transaction_id" TEXT,
    "paid_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_renewals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_records" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "out_trade_no" TEXT NOT NULL,
    "transaction_id" TEXT,
    "amount" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "pay_time" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payment_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refund_records" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "out_refund_no" TEXT NOT NULL,
    "refund_id" TEXT,
    "refund_amount" INTEGER NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "refund_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_transactions" (
    "id" TEXT NOT NULL,
    "companion_id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "out_trade_no" TEXT,
    "transaction_id" TEXT,
    "reason" TEXT,
    "operator_id" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deposit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "companion_id" TEXT NOT NULL,
    "last_message" TEXT,
    "last_msg_at" TIMESTAMPTZ,
    "unread_count_user" INTEGER NOT NULL DEFAULT 0,
    "unread_count_companion" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "message_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "msg_type" "MessageType" NOT NULL DEFAULT 'text',
    "sender_user_id" TEXT,
    "sender_companion_id" TEXT,
    "content" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "companion_id" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "read_at" TIMESTAMPTZ,
    "related_id" TEXT,
    "related_type" TEXT,
    "extra_data" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "companion_id" TEXT NOT NULL,
    "order_id" TEXT,
    "type" "SettlementType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "balance_before" INTEGER NOT NULL,
    "balance_after" INTEGER NOT NULL,
    "order_no" TEXT,
    "service_name" TEXT,
    "customer_name" TEXT,
    "duration" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "platform_configs" (
    "id" TEXT NOT NULL,
    "config_key" TEXT NOT NULL,
    "config_value" JSONB NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "platform_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL DEFAULT 'viewer',
    "display_name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_operation_logs" (
    "id" TEXT NOT NULL,
    "admin_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_operation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "announcements" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "target_audience" "NotificationTarget" NOT NULL DEFAULT 'all',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "published_at" TIMESTAMPTZ,
    "expires_at" TIMESTAMPTZ,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reviews" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "companion_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL DEFAULT 5,
    "content" TEXT,
    "is_auto" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_stats" (
    "id" TEXT NOT NULL,
    "stat_date" TEXT NOT NULL,
    "stat_hour" INTEGER,
    "order_count" INTEGER NOT NULL DEFAULT 0,
    "completed_count" INTEGER NOT NULL DEFAULT 0,
    "cancelled_count" INTEGER NOT NULL DEFAULT 0,
    "gmv" INTEGER NOT NULL DEFAULT 0,
    "new_users" INTEGER NOT NULL DEFAULT 0,
    "active_users" INTEGER NOT NULL DEFAULT 0,
    "new_companions" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "daily_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_current_locations" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "companion_id" TEXT NOT NULL,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "accuracy" DOUBLE PRECISION,
    "speed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "distance_to_target" INTEGER NOT NULL DEFAULT 0,
    "has_arrived" BOOLEAN NOT NULL DEFAULT false,
    "estimated_arrival" TIMESTAMP(3),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "order_current_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_location_histories" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "latitude" DECIMAL(10,8) NOT NULL,
    "longitude" DECIMAL(11,8) NOT NULL,
    "speed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recorded_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_location_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "withdrawals" (
    "id" TEXT NOT NULL,
    "companion_id" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'pending',
    "partner_trade_no" TEXT,
    "payment_no" TEXT,
    "payment_time" TIMESTAMPTZ,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMPTZ,
    "review_note" TEXT,
    "fail_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "withdrawals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_configs" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "updated_by" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "system_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_openid_key" ON "users"("openid");

-- CreateIndex
CREATE INDEX "users_openid_idx" ON "users"("openid");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE UNIQUE INDEX "companions_openid_key" ON "companions"("openid");

-- CreateIndex
CREATE INDEX "companions_openid_idx" ON "companions"("openid");

-- CreateIndex
CREATE INDEX "companions_audit_status_idx" ON "companions"("audit_status");

-- CreateIndex
CREATE INDEX "companions_is_online_audit_status_idx" ON "companions"("is_online", "audit_status");

-- CreateIndex
CREATE INDEX "companion_services_companion_id_is_active_idx" ON "companion_services"("companion_id", "is_active");

-- CreateIndex
CREATE INDEX "companion_audit_records_companion_id_idx" ON "companion_audit_records"("companion_id");

-- CreateIndex
CREATE INDEX "companion_audit_records_admin_id_idx" ON "companion_audit_records"("admin_id");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_no_key" ON "orders"("order_no");

-- CreateIndex
CREATE INDEX "orders_user_id_status_idx" ON "orders"("user_id", "status");

-- CreateIndex
CREATE INDEX "orders_companion_id_status_idx" ON "orders"("companion_id", "status");

-- CreateIndex
CREATE INDEX "orders_companion_id_status_created_at_idx" ON "orders"("companion_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "orders_status_idx" ON "orders"("status");

-- CreateIndex
CREATE INDEX "orders_order_no_idx" ON "orders"("order_no");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at");

-- CreateIndex
CREATE INDEX "order_operation_logs_order_id_idx" ON "order_operation_logs"("order_id");

-- CreateIndex
CREATE INDEX "order_operation_logs_operator_type_operator_id_idx" ON "order_operation_logs"("operator_type", "operator_id");

-- CreateIndex
CREATE UNIQUE INDEX "order_renewals_out_trade_no_key" ON "order_renewals"("out_trade_no");

-- CreateIndex
CREATE INDEX "order_renewals_order_id_idx" ON "order_renewals"("order_id");

-- CreateIndex
CREATE INDEX "order_renewals_status_idx" ON "order_renewals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_records_out_trade_no_key" ON "payment_records"("out_trade_no");

-- CreateIndex
CREATE INDEX "payment_records_order_id_idx" ON "payment_records"("order_id");

-- CreateIndex
CREATE INDEX "payment_records_out_trade_no_idx" ON "payment_records"("out_trade_no");

-- CreateIndex
CREATE UNIQUE INDEX "refund_records_out_refund_no_key" ON "refund_records"("out_refund_no");

-- CreateIndex
CREATE INDEX "refund_records_payment_id_idx" ON "refund_records"("payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "deposit_transactions_out_trade_no_key" ON "deposit_transactions"("out_trade_no");

-- CreateIndex
CREATE INDEX "deposit_transactions_companion_id_idx" ON "deposit_transactions"("companion_id");

-- CreateIndex
CREATE INDEX "deposit_transactions_type_idx" ON "deposit_transactions"("type");

-- CreateIndex
CREATE INDEX "message_sessions_user_id_last_msg_at_idx" ON "message_sessions"("user_id", "last_msg_at");

-- CreateIndex
CREATE INDEX "message_sessions_companion_id_last_msg_at_idx" ON "message_sessions"("companion_id", "last_msg_at");

-- CreateIndex
CREATE UNIQUE INDEX "message_sessions_user_id_companion_id_key" ON "message_sessions"("user_id", "companion_id");

-- CreateIndex
CREATE INDEX "messages_session_id_created_at_idx" ON "messages"("session_id", "created_at");

-- CreateIndex
CREATE INDEX "messages_sender_user_id_idx" ON "messages"("sender_user_id");

-- CreateIndex
CREATE INDEX "messages_sender_companion_id_idx" ON "messages"("sender_companion_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_companion_id_created_at_idx" ON "notifications"("companion_id", "created_at");

-- CreateIndex
CREATE INDEX "notifications_user_id_is_read_idx" ON "notifications"("user_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_companion_id_is_read_idx" ON "notifications"("companion_id", "is_read");

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type");

-- CreateIndex
CREATE INDEX "settlements_companion_id_created_at_idx" ON "settlements"("companion_id", "created_at");

-- CreateIndex
CREATE INDEX "settlements_companion_id_type_idx" ON "settlements"("companion_id", "type");

-- CreateIndex
CREATE INDEX "settlements_order_id_idx" ON "settlements"("order_id");

-- CreateIndex
CREATE INDEX "settlements_created_at_idx" ON "settlements"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "platform_configs_config_key_key" ON "platform_configs"("config_key");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");

-- CreateIndex
CREATE INDEX "admin_operation_logs_admin_id_idx" ON "admin_operation_logs"("admin_id");

-- CreateIndex
CREATE INDEX "admin_operation_logs_created_at_idx" ON "admin_operation_logs"("created_at");

-- CreateIndex
CREATE INDEX "announcements_target_audience_is_active_published_at_idx" ON "announcements"("target_audience", "is_active", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "reviews_order_id_key" ON "reviews"("order_id");

-- CreateIndex
CREATE INDEX "reviews_user_id_idx" ON "reviews"("user_id");

-- CreateIndex
CREATE INDEX "reviews_companion_id_idx" ON "reviews"("companion_id");

-- CreateIndex
CREATE INDEX "reviews_created_at_idx" ON "reviews"("created_at");

-- CreateIndex
CREATE INDEX "daily_stats_stat_date_idx" ON "daily_stats"("stat_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_stats_stat_date_stat_hour_key" ON "daily_stats"("stat_date", "stat_hour");

-- CreateIndex
CREATE UNIQUE INDEX "order_current_locations_order_id_key" ON "order_current_locations"("order_id");

-- CreateIndex
CREATE INDEX "order_current_locations_companion_id_idx" ON "order_current_locations"("companion_id");

-- CreateIndex
CREATE INDEX "order_current_locations_updated_at_idx" ON "order_current_locations"("updated_at");

-- CreateIndex
CREATE INDEX "order_location_histories_order_id_recorded_at_idx" ON "order_location_histories"("order_id", "recorded_at");

-- CreateIndex
CREATE INDEX "order_location_histories_recorded_at_idx" ON "order_location_histories"("recorded_at");

-- CreateIndex
CREATE UNIQUE INDEX "withdrawals_partner_trade_no_key" ON "withdrawals"("partner_trade_no");

-- CreateIndex
CREATE INDEX "withdrawals_companion_id_idx" ON "withdrawals"("companion_id");

-- CreateIndex
CREATE INDEX "withdrawals_status_idx" ON "withdrawals"("status");

-- CreateIndex
CREATE INDEX "withdrawals_created_at_idx" ON "withdrawals"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "system_configs_key_key" ON "system_configs"("key");

-- CreateIndex
CREATE INDEX "system_configs_key_idx" ON "system_configs"("key");

-- AddForeignKey
ALTER TABLE "companion_services" ADD CONSTRAINT "companion_services_companion_id_fkey" FOREIGN KEY ("companion_id") REFERENCES "companions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companion_audit_records" ADD CONSTRAINT "companion_audit_records_companion_id_fkey" FOREIGN KEY ("companion_id") REFERENCES "companions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companion_audit_records" ADD CONSTRAINT "companion_audit_records_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_companion_id_fkey" FOREIGN KEY ("companion_id") REFERENCES "companions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_operation_logs" ADD CONSTRAINT "order_operation_logs_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_renewals" ADD CONSTRAINT "order_renewals_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refund_records" ADD CONSTRAINT "refund_records_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "payment_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_companion_id_fkey" FOREIGN KEY ("companion_id") REFERENCES "companions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_sessions" ADD CONSTRAINT "message_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_sessions" ADD CONSTRAINT "message_sessions_companion_id_fkey" FOREIGN KEY ("companion_id") REFERENCES "companions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "message_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_companion_id_fkey" FOREIGN KEY ("sender_companion_id") REFERENCES "companions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_companion_id_fkey" FOREIGN KEY ("companion_id") REFERENCES "companions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_companion_id_fkey" FOREIGN KEY ("companion_id") REFERENCES "companions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_operation_logs" ADD CONSTRAINT "admin_operation_logs_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "withdrawals" ADD CONSTRAINT "withdrawals_companion_id_fkey" FOREIGN KEY ("companion_id") REFERENCES "companions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
