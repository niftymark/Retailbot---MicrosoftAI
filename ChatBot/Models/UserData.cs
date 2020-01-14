using System;
using System.Collections.Generic;
using System.Linq;
using Microsoft.Azure.CognitiveServices.Vision.CustomVision.Prediction.Models;

namespace ChatBot.Models
{
    public class UserData
    {
        public string SelectedSchedule { get; set; }

        public bool ProductWasFound { get; set; }

        public bool IsStoreSelectionOk { get; set; }

        public string Name { get; set; }

        public string Gender { get; set; }

        public string PersonId { get; set; }

        public CroppedImage CroppedImage { get; set; }

        public BoundingBox ImageBoundingBox { get; set; }

        public int TurnCount { get; set; } = 0;
    }
}
