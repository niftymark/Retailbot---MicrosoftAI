using System;
using System.Collections.Generic;
using System.Linq;
using System.Web;
using Newtonsoft.Json;

namespace ChatBot.Models
{
    public enum CustomerCategory
    {
        Women,
        Men,
        Girls,
        Boys,
        Baby
    }

    public class ProductModel
    {
        [JsonProperty("id")]
        public Guid Id { get; set; }

        [JsonProperty("price")]
        public double Price { get; set; }

        [JsonProperty("title")]
        public string Title { get; set; }

        [JsonProperty("image")]
        public string Image { get; set; }

        [JsonIgnore]
        public CustomerCategory CustomerCategory { get; set; }

        public static IList<ProductModel> GetWhatToWearMatchingGarments(string imagesHost)
        {
            return new List<ProductModel>
            {
                new ProductModel
                {
                      Id = new Guid("7D8430DE-AE3D-4074-BA10-F7CBD4BFE5D7"),
                      Price = 29.95,
                      Title = "Men's Long Sleeve Blue Plain Casual Shirt",
                      Image = $"{imagesHost}/whattowear/male/garments-shirt1.png",
                      CustomerCategory = CustomerCategory.Men
                },
                new ProductModel
                {
                      Id = new Guid("F0D3DD70-BE24-4027-AFC0-F68F637C38B2"),
                      Price = 31.95,
                      Title = "Men's Long Sleeve Dark Blue Plain Casual Shirt",
                      Image = $"{imagesHost}/whattowear/male/garments-shirt2.png",
                      CustomerCategory = CustomerCategory.Men
                },
                new ProductModel
                {
                      Id = new Guid("DA63CA78-F9BD-4AFE-80F6-8C492EE57693"),
                      Price = 32.95,
                      Title = "Men's Long Sleeve Light Blue Plain Casual Shirt",
                      Image = $"{imagesHost}/whattowear/male/garments-shirt3.png",
                      CustomerCategory = CustomerCategory.Men
                },
                new ProductModel
                {
                      Id = new Guid("EF14275E-EF67-4D91-B4F1-716CBF6BB616"),
                      Price = 28.95,
                      Title = "Men's Long Sleeve Blue Check Casual Shirt",
                      Image = $"{imagesHost}/whattowear/male/garments-shirt4.png",
                      CustomerCategory = CustomerCategory.Men
                },
                new ProductModel
                {
                      Id = new Guid("93df9fa7-e30b-471f-91e2-7c003e121da5"),
                      Title = "Women's Long Sleeve Blue Striped Casual Shirt",
                      Image = $"{imagesHost}/whattowear/female/garments-shirt1.png",
                      Price = 75.99,
                      CustomerCategory = CustomerCategory.Women
                },
                new ProductModel
                {
                      Id = new Guid("467b9ab2-0263-4217-a094-ac1e50cdcb43"),
                      Title = "Women's Maternity Button Down Plaid Shirt",
                      Image = $"{imagesHost}/whattowear/female/garments-shirt2.png",
                      Price = 45.99,
                      CustomerCategory = CustomerCategory.Women
                },
                new ProductModel
                {
                      Id = new Guid("40af91a0-8d36-4357-a87f-376fda10f759"),
                      Title = "Women's Plus Wrinkle-Free Slim Dress Shirt",
                      Image = $"{imagesHost}/whattowear/female/garments-shirt3.png",
                      Price = 37.95,
                      CustomerCategory = CustomerCategory.Women
                },
                new ProductModel
                {
                      Id = new Guid("22F33552-253B-434F-B4F0-9B6261F9C2BB"),
                      Title = "Women's Weatherproff Vintage Long Sleeve Front Button Shirt ",
                      Image = $"{imagesHost}/whattowear/female/garments-shirt4.png",
                      Price = 28.45,
                      CustomerCategory = CustomerCategory.Women
                }
            };
        }

        public static IList<ProductModel> GetWhatToWearSuggestedPairings(string imagesHost)
        {
            return new List<ProductModel>
             {
                new ProductModel
                {
                      Id = new Guid("8F7987BC-9C9C-4689-B9E7-C640D6F5D485"),
                      Price = 49.95,
                      Title = "Limited Edition Leather Lace Up Dress Shoes",
                      Image = $"{imagesHost}/whattowear/male/pairing-shoes.png",
                      CustomerCategory = CustomerCategory.Men
                },
                new ProductModel
                {
                      Id = new Guid("3A83DB2C-1976-418F-9EBD-C1536D94072D"),
                      Price = 99.95,
                      Title = "Black Suit Trouser",
                      Image = $"{imagesHost}/whattowear/male/pairing-trouser.png",
                      CustomerCategory = CustomerCategory.Men
                },
                new ProductModel
                {
                      Id = new Guid("FC65EE01-3C68-4B03-8C9A-F8E4F71B0F16"),
                      Price = 39.95,
                      Title = "Leather Dress Belt",
                      Image = $"{imagesHost}/whattowear/male/pairing-belt.png",
                      CustomerCategory = CustomerCategory.Men
                },
                new ProductModel
                {
                      Id = new Guid("16351781-4052-4CC3-99C6-330C69004FB1"),
                      Price = 139.95,
                      Title = "Black Leather Briefcase",
                      Image = $"{imagesHost}/whattowear/male/pairing-case.png",
                      CustomerCategory = CustomerCategory.Men
                },
                new ProductModel
                {
                      Id = new Guid("9D1AF35E-982F-4395-85EA-638C9F4A46E6"),
                      Price = 49.95,
                      Title = "Limited Edition Sunglasses",
                      Image = $"{imagesHost}/whattowear/female/pairing-sunglasses.png",
                      CustomerCategory = CustomerCategory.Women
                },
                new ProductModel
                {
                      Id = new Guid("ED5CEB2D-2184-46DA-889C-2C9F2AA5C170"),
                      Price = 99.95,
                      Title = "Black Socks",
                      Image = $"{imagesHost}/whattowear/female/pairing-socks.png",
                      CustomerCategory = CustomerCategory.Women
                },
                new ProductModel
                {
                      Id = new Guid("9D1AF35E-982F-4395-85EA-638C9F4A46E7"),
                      Price = 49.95,
                      Title = "Limited Edition Sunglasses Contoso",
                      Image = $"{imagesHost}/whattowear/female/pairing-sunglasses.png",
                      CustomerCategory = CustomerCategory.Women
                },
                new ProductModel
                {
                      Id = new Guid("22F33552-253B-434F-B4F0-9B6261F9C2BC"),
                      Price = 99.95,
                      Title = "Black Socks Others",
                      Image = $"{imagesHost}/whattowear/female/pairing-socks.png",
                      CustomerCategory = CustomerCategory.Women
                },
            };
        }
    }
}
