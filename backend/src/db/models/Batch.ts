import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import { sequelize } from '../index';
import { BatchStatus } from '../../types/batch';

export class Batch extends Model<InferAttributes<Batch>, InferCreationAttributes<Batch>> {
  declare id: string;
  declare order_ids: string[];
  declare status: CreationOptional<BatchStatus>;
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
