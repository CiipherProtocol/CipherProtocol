import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import { sequelize } from '../index';
import { SettlementResult } from '../../types/settlement';

export class Settlement extends Model<
  InferAttributes<Settlement>,
  InferCreationAttributes<Settlement>
> {
  declare id: string;
  declare batch_id: string;
  declare results: SettlementResult[];
  declare status: CreationOptional<'settled' | 'failed'>;
  declare settled_at: CreationOptional<Date>;
}

Settlement.init(
  {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
    },
    batch_id: {
      type: DataTypes.UUID,
      allowNull: false,
    },
    results: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('settled', 'failed'),
      defaultValue: 'settled',
    },
    settled_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'Settlement',
    tableName: 'settlements',
    timestamps: false,
  }
);
