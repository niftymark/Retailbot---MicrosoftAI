using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace ChatBot.Models
{
    public class FaceRecognitionResult
    {
        public bool IsValid { get; set; }

        public string Name { get; set; }

        public string Gender { get; set; }
    }
}
