import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import { sequelize } from '../index';
import { BatchStatus } from '../../types/batch';

export class Batch extends Model<InferAttributes<Batch>, InferCreationAttributes<Batch>> {
  declare id: string;
  declare order_ids: string[];
  declare status: CreationOptional<BatchStatus>;
  /** sha256 commitment to the batch's ordered ciphertexts, as sealed on-chain (hex). */
  declare content_hash: CreationOptional<string | null>;
  /** Stellar transaction that sealed it (null when using the dev in-memory ledger). */
  declare commitment_tx: CreationOptional<string | null>;
  declare created_at: CreationOptional<Date>;
}

Batch.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    order_ids: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    content_hash: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    commitment_tx: {
      type: DataTypes.STRING(64),
      allowNull: true,
    },
    status: {
      type: DataTypes.ENUM('created', 'submitted', 'settled', 'failed'),
      defaultValue: 'created',
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'Batch',
    tableName: 'batches',
    timestamps: false,
  }
);
