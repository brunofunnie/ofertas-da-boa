import unittest
from app import categorize, parse_price, Database, ProductParser

class AppTest(unittest.TestCase):
    def test_prices_and_categories(self):
        self.assertEqual(parse_price('R$ 1.234,56'), 123456)
        self.assertEqual(categorize('Coxa e sobrecoxa de frango'), 'Carnes')
        self.assertEqual(categorize('Detergente para roupas'), 'Limpeza')

    def test_tauste_product_parser(self):
        parser = ProductParser()
        parser.feed('<div class="product-item-info"><img src="x"><a class="product-item-link" href="https://example.com/arroz">Arroz 5kg</a><span class="price-wrapper" data-price-amount="19.90"></span></div>')
        self.assertEqual(parser.products[0]['price'], 1990)
        self.assertEqual(parser.products[0]['name'], 'Arroz 5kg')

    def test_history_and_lists(self):
        db = Database(':memory:')
        db.save_offers('tauste', [{'name':'Arroz 5kg', 'price': 2000, 'url':'https://example.com'}])
        db.save_offers('tauste', [{'name':'Arroz 5kg', 'price': 1800, 'url':'https://example.com'}])
        self.assertEqual(db.offers()[0]['previous_price'], 2000)
        list_id = db.create_list('Semana')
        offer_id = db.offers()[0]['id']
        db.add_item(list_id, offer_id)
        self.assertEqual(len(db.lists()[0]['items']), 1)

if __name__ == '__main__': unittest.main()
