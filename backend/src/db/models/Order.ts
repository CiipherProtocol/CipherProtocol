import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import { sequelize } from '../index';
import { OrderStatus } from '../../types/order';

export class Order extends Model<InferAttributes<Order>, InferCreationAttributes<Order>> {
  declare id: string;
  declare user_address: string;
  declare encrypted_data: string;
  declare threshold_pubkey: string;
  /** Plaintext order fields: NULL until the validator set threshold-decrypts
   * the order's batch. The backend never sees them before that. */
  declare token_in: CreationOptional<string | null>;
  declare token_out: CreationOptional<string | null>;
  declare amount_in: CreationOptional<string | null>;
  declare min_amount_out: CreationOptional<string | null>;
  declare amount_out: CreationOptional<string | null>;
  declare failure_reason: CreationOptional<string | null>;
  declare nonce: number;
  declare status: CreationOptional<OrderStatus>;
  declare batch_id: CreationOptional<string | null>;
  declare created_at: CreationOptional<Date>;
}

Order.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    user_address: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    encrypted_data: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    threshold_pubkey: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    token_in: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    token_out: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    amount_in: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    min_amount_out: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    amount_out: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    failure_reason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    nonce: {
      type: DataTypes.BIGINT,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('pending', 'batched', 'settled', 'failed'),
      defaultValue: 'pending',
    },
    batch_id: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'Order',
    tableName: 'orders',
    timestamps: false,
  }
);
