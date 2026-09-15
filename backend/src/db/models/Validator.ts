import { DataTypes, Model, InferAttributes, InferCreationAttributes, CreationOptional } from 'sequelize';
import { sequelize } from '../index';

export class Validator extends Model<
  InferAttributes<Validator>,
  InferCreationAttributes<Validator>
> {
  declare id: CreationOptional<number>;
  declare address: string;
  declare public_share: string;
  declare status: CreationOptional<'active' | 'inactive'>;
}

Validator.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    address: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    public_share: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      defaultValue: 'active',
    },
  },
  {
    sequelize,
    modelName: 'Validator',
    tableName: 'validators',
    timestamps: false,
  }
);
