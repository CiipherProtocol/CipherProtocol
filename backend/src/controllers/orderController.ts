import crypto from 'crypto';
import { Order } from '../db/models/Order';
import { SubmitOrderBody } from '../types/order';
import { NotFoundError } from '../utils/errors';

export const orderController = {
  async submitOrder(userAddress: string, orderData: SubmitOrderBody) {
    const order = await Order.create({
      id: crypto.randomUUID(),
      user_address: userAddress,
      encrypted_data: orderData.encrypted_data,
      threshold_pubkey: orderData.threshold_pubkey,
      token_in: orderData.token_in,
      token_out: orderData.token_out,
      amount_in: orderData.amount_in,
      min_amount_out: orderData.min_amount_out,
      nonce: orderData.nonce,
      status: 'pending',
    });

    return order;
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
