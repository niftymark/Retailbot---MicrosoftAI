using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using ChatBot.Models;
using Microsoft.Extensions.Configuration;

namespace ChatBot.Services
{
    public class ProductService
    {
        public ProductService(IConfiguration configuration)
        {
            BingVisualSearchService = new BingVisualSearchService(configuration["bingSearchKey"]);
            SiteImagesPath = configuration["imageHostUrl"];
        }

        public string SiteImagesPath { get; }

        public BingVisualSearchService BingVisualSearchService { get; }

        public async Task<IList<ProductModel>> FindSimilarProductsAsync(string imageUrl, BoundingRectangle boundingRectangle)
        {
            var visualResult = await BingVisualSearchService.FindSimilarProductsAsync(imageUrl, boundingRectangle);
            var imagesActions = visualResult.Tags.SelectMany(tag => tag.Actions).Where(action => action.ActionType.Equals("VisualSearch", StringComparison.OrdinalIgnoreCase))
                .SelectMany(action => action.Data.Value).Where(i => FilterImageBySize(i)).OrderBy(i => i.Width).Take(5).ToList();
            var similarProducts = new List<ProductModel>();
            foreach (var imageFound in imagesActions)
            {
                similarProducts.Add(new ProductModel
                {
                    Id = Guid.NewGuid(),
                    Price = GetPriceFromResult(imageFound),
                    Title = imageFound.Name,
                    Image = imageFound.ThumbnailUrl,
                });
            }

            return similarProducts;
        }

        public async Task<SuggestedProductsResult> GetSuggestedProductsByGenderAsync(string imageUrl, CustomerCategory category)
        {
            var garments = await FindSimilarProductsAsync(imageUrl);

            var pairings = ProductModel.GetWhatToWearSuggestedPairings(SiteImagesPath);

            var products = new SuggestedProductsResult
            {
                Matching = garments,

                Suggested = pairings.Where(p => p.CustomerCategory == category).ToList(),
            };

            return products;
        }

        private async Task<IList<ProductModel>> FindSimilarProductsAsync(string imageUrl)
        {
            var visualResult = await BingVisualSearchService.FindSimilarProductsAsync(imageUrl);
            var imagesActions = visualResult.Tags.SelectMany(tag => tag.Actions).SelectMany(action => action.Data.Value).Take(4).ToList();
            var similarProducts = new List<ProductModel>();
            foreach (var imageFound in imagesActions)
            {
                similarProducts.Add(new ProductModel
                {
                    Id = Guid.NewGuid(),
                    Price = GetPriceFromResult(imageFound),
                    Title = imageFound.Name,
                    Image = imageFound.ContentUrl,
                });
            }

            return similarProducts;
        }

        private double GetPriceFromResult(ImageAction image)
        {
            var price = 0.0;
            if (image.InsightsMetadata != null && image.InsightsMetadata.AggregateOffer != null)
            {
                price = image.InsightsMetadata.AggregateOffer.Offers.First().Price;
            }
            else
            {
                price = new Random().Next(15, 50) + 0.99;
            }

            return price;
        }

        private bool FilterImageBySize(ImageAction imageAction)
        {
            return imageAction.Width == 400 && imageAction.Name.ToLower().Contains("watch");
        }
    }
}
