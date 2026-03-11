create table if not exists users (
  id bigint unsigned not null auto_increment,
  name varchar(120) not null,
  email varchar(190) not null,
  password varchar(255) not null,
  role varchar(40) not null default 'admin',
  is_active tinyint(1) not null default 1,
  created_at datetime not null default current_timestamp,
  updated_at datetime not null default current_timestamp on update current_timestamp,
  primary key (id),
  unique key users_email_unique (email)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists financial_accounts (
  id bigint unsigned not null auto_increment,
  user_id bigint unsigned not null,
  name varchar(120) not null,
  type varchar(40) not null default 'caixa',
  current_balance decimal(14,2) not null default 0.00,
  color varchar(20) null,
  icon varchar(60) null,
  created_at datetime not null default current_timestamp,
  updated_at datetime not null default current_timestamp on update current_timestamp,
  primary key (id),
  key financial_accounts_user_idx (user_id),
  constraint financial_accounts_user_fk foreign key (user_id) references users(id) on delete cascade
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists financial_categories (
  id bigint unsigned not null auto_increment,
  user_id bigint unsigned not null,
  name varchar(120) not null,
  type varchar(20) not null,
  color varchar(20) null,
  icon varchar(60) null,
  is_active tinyint(1) not null default 1,
  created_at datetime not null default current_timestamp,
  updated_at datetime not null default current_timestamp on update current_timestamp,
  primary key (id),
  key financial_categories_user_idx (user_id),
  constraint financial_categories_user_fk foreign key (user_id) references users(id) on delete cascade
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists financial_transactions (
  id bigint unsigned not null auto_increment,
  user_id bigint unsigned not null,
  account_id bigint unsigned null,
  category_id bigint unsigned null,
  type varchar(20) not null,
  title varchar(160) not null,
  description text null,
  amount decimal(14,2) not null,
  due_date date null,
  paid_at datetime null,
  status varchar(20) not null default 'pending',
  receipt_path varchar(255) null,
  invoice_path varchar(255) null,
  created_at datetime not null default current_timestamp,
  updated_at datetime not null default current_timestamp on update current_timestamp,
  primary key (id),
  key financial_transactions_user_idx (user_id),
  key financial_transactions_account_idx (account_id),
  key financial_transactions_category_idx (category_id),
  constraint financial_transactions_user_fk foreign key (user_id) references users(id) on delete cascade,
  constraint financial_transactions_account_fk foreign key (account_id) references financial_accounts(id) on delete set null,
  constraint financial_transactions_category_fk foreign key (category_id) references financial_categories(id) on delete set null
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists shipping_orders (
  id bigint unsigned not null auto_increment,
  user_id bigint unsigned not null,
  import_key varchar(190) not null,
  platform_order_number varchar(120) null,
  ad_name varchar(255) null,
  variation varchar(255) null,
  image_url text null,
  buyer_notes text null,
  observations text null,
  product_qty int not null default 1,
  recipient_name varchar(190) null,
  tracking_number varchar(120) null,
  source_file_name varchar(190) null,
  shipping_deadline date null,
  packed tinyint(1) not null default 0,
  production_separated tinyint(1) not null default 0,
  row_raw json null,
  created_at datetime not null default current_timestamp,
  updated_at datetime not null default current_timestamp on update current_timestamp,
  primary key (id),
  unique key shipping_orders_user_import_key_unique (user_id, import_key),
  key shipping_orders_user_tracking_idx (user_id, tracking_number),
  key shipping_orders_user_deadline_idx (user_id, shipping_deadline),
  constraint shipping_orders_user_fk foreign key (user_id) references users(id) on delete cascade
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists cover_agenda_items (
  id bigint unsigned not null auto_increment,
  user_id bigint unsigned not null,
  order_id varchar(120) not null,
  front_image_path varchar(255) not null,
  back_image_path varchar(255) not null,
  printed tinyint(1) not null default 0,
  printed_at datetime null,
  created_at datetime not null default current_timestamp,
  updated_at datetime not null default current_timestamp on update current_timestamp,
  primary key (id),
  key cover_agenda_items_user_idx (user_id, updated_at),
  key cover_agenda_items_printed_idx (user_id, printed, updated_at),
  constraint cover_agenda_items_user_fk foreign key (user_id) references users(id) on delete cascade
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists app_files (
  id bigint unsigned not null auto_increment,
  user_id bigint unsigned not null,
  module varchar(60) not null,
  related_id bigint unsigned null,
  original_name varchar(255) not null,
  stored_path varchar(255) not null,
  mime_type varchar(120) null,
  file_size bigint unsigned not null default 0,
  created_at datetime not null default current_timestamp,
  updated_at datetime not null default current_timestamp on update current_timestamp,
  primary key (id),
  key app_files_user_module_idx (user_id, module),
  constraint app_files_user_fk foreign key (user_id) references users(id) on delete cascade
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
