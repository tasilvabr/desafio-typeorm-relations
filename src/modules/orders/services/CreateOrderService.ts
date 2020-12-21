import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,

    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,

    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customerExists = await this.customersRepository.findById(customer_id);

    if (!customerExists) {
      throw new AppError('Could not find any customer with the given id');
    }

    const productsExists = await this.productsRepository.findAllById(products);

    if (!productsExists.length) {
      throw new AppError('Could not find any products with the given ids');
    }

    const existentsProductsIds = productsExists.map(product => product.id);

    const checkInexistentProducts = products.filter(
      product => !existentsProductsIds.includes(product.id),
    );

    if (checkInexistentProducts.length) {
      let allInexistentsIds: string | null = null;

      checkInexistentProducts.map(check => {
        if (!allInexistentsIds) {
          allInexistentsIds = check.id;
        } else {
          allInexistentsIds += `, ${check.id}`;
        }
        return '';
      });
      throw new AppError(`Could not find products by Ids ${allInexistentsIds}`);
    }

    const findProductsWithNoQuantityAvailable = products.filter(
      product =>
        productsExists.filter(p => p.id === product.id)[0].quantity <
        product.quantity,
    );

    if (findProductsWithNoQuantityAvailable.length) {
      let allInexistentsQuantitiesIds: string | null = null;

      findProductsWithNoQuantityAvailable.map(check => {
        if (!allInexistentsQuantitiesIds) {
          allInexistentsQuantitiesIds = `${check.id} (Quantity: ${check.quantity})`;
        } else {
          allInexistentsQuantitiesIds += `, ${check.id} (Quantity: ${check.quantity})`;
        }
        return '';
      });
      throw new AppError(
        `The quantity is not available to Ids ${allInexistentsQuantitiesIds}`,
      );
    }

    const serializedProducts = products.map(product => ({
      product_id: product.id,
      quantity: product.quantity,
      price: productsExists.filter(p => p.id === product.id)[0].price,
    }));

    const order = await this.ordersRepository.create({
      customer: customerExists,
      products: serializedProducts,
    });

    const orderedProductsQuantity = products.map(product => ({
      id: product.id,
      quantity:
        productsExists.filter(p => p.id === product.id)[0].quantity -
        product.quantity,
    }));

    await this.productsRepository.updateQuantity(orderedProductsQuantity);

    return order;
  }
}

export default CreateOrderService;
