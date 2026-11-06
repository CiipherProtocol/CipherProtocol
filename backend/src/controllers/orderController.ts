import crypto from 'crypto';
import { Order } from '../db/models/Order';
import { SubmitOrderBody } from '../types/order';
import { AppError, NotFoundError } from '../utils/errors';

export const orderController = {
  async submitOrder(userAddress: string, orderData: SubmitOrderBody) {
    const duplicate = await Order.findOne({
      where: { user_address: userAddress, nonce: orderData.nonce },
    });
    if (duplicate) throw new AppError('nonce already used for this address', 409);

    return Order.create({
      id: crypto.randomUUID(),
      user_address: userAddress,
      encrypted_data: orderData.encrypted_data,
      threshold_pubkey: orderData.threshold_pubkey,
      nonce: orderData.nonce,
      status: 'pending',
    });
  },

  async getOrder(orderId: string) {
    const order = await Order.findByPk(orderId);
    if (!order) throw new NotFoundError('Order not found');
    return order;
  },

  async getUserOrders(userAddress: string) {
    return Order.findAll({
      where: { user_address: userAddress },
      order: [['created_at', 'DESC']],
    });
  },
};
